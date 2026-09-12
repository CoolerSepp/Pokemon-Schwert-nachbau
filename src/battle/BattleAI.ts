import { GameData } from '@/data/GameData';
import type { AiProfile, MoveData, WeatherKind } from '@/data/schema';
import type { RNG } from '@/core/RNG';
import type { Creature } from '@/creatures/Creature';
import { calculateDamage, effectiveSpeed } from './DamageCalc';
import type { BattleAction, SideState } from './BattleTypes';

export interface AiContext {
  self: SideState;
  opponent: SideState;
  weather: WeatherKind;
  rng: RNG;
  turn: number;
  /** Darf die KI Gegenstaende einsetzen? */
  allowItems: boolean;
  /** Darf die KI gigantifizieren? */
  allowGigantic: boolean;
}

interface ScoredMove {
  index: number;
  move: MoveData;
  score: number;
  expectedDamage: number;
  killsTarget: boolean;
}

function active(side: SideState): Creature {
  return side.party[side.activeIndex]!;
}

/**
 * Gegner-KI.
 *
 * Alle Profile teilen dieselbe Bewertungsfunktion; sie unterscheiden sich in
 * Rauschanteil und darin, welche Zusatzentscheidungen (Wechsel, Gegenstand,
 * Gigantifizierung) ueberhaupt in Betracht gezogen werden. Dadurch skaliert
 * die Schwierigkeit spuerbar, ohne mehrere KIs pflegen zu muessen.
 */
export class BattleAI {
  constructor(private readonly profile: AiProfile) {}

  chooseAction(ctx: AiContext): BattleAction {
    const self = active(ctx.self);
    const target = active(ctx.opponent);

    if (this.profile === 'random') {
      const usable = self.moves
        .map((m, i) => ({ m, i }))
        .filter((e) => e.m.pp > 0);
      if (usable.length === 0) return { kind: 'move', moveIndex: 0 };
      return { kind: 'move', moveIndex: ctx.rng.pick(usable).i };
    }

    const scored = this.scoreMoves(ctx, self, target);

    // --- Gegenstand einsetzen (nur staerkere Profile) ----------------------
    if (ctx.allowItems && this.profile !== 'basic' && ctx.self.items.length > 0) {
      const itemAction = this.considerItem(ctx, self);
      if (itemAction) return itemAction;
    }

    // --- Wechsel erwaegen --------------------------------------------------
    if (this.profile === 'smart' || this.profile === 'expert' || this.profile === 'boss') {
      const switchAction = this.considerSwitch(ctx, self, target, scored);
      if (switchAction) return switchAction;
    }

    // --- Gigantifizieren ---------------------------------------------------
    const gigantic =
      ctx.allowGigantic &&
      ctx.self.canGigantic &&
      !ctx.self.giganticUsed &&
      self.canGigantic &&
      this.shouldGigantify(ctx, self, target);

    if (scored.length === 0) {
      // Keine AP mehr: Verzweiflungsattacke auf Slot 0 (Engine faengt das ab).
      return { kind: 'move', moveIndex: 0 };
    }

    const best = this.pickWithNoise(scored, ctx.rng);
    return { kind: 'move', moveIndex: best.index, gigantic };
  }

  /** Bewertet alle einsetzbaren Attacken der aktiven Kreatur. */
  private scoreMoves(ctx: AiContext, self: Creature, target: Creature): ScoredMove[] {
    const out: ScoredMove[] = [];
    for (let i = 0; i < self.moves.length; i++) {
      const slot = self.moves[i]!;
      if (slot.pp <= 0) continue;
      const move = GameData.moves.tryGet(slot.moveId);
      if (!move) continue;

      let score = 0;
      let expectedDamage = 0;

      if (move.category === 'status') {
        score = this.scoreStatusMove(ctx, move, self, target);
      } else {
        const dmg = calculateDamage({
          attacker: self, defender: target,
          attackerSide: ctx.self, defenderSide: ctx.opponent,
          move, weather: ctx.weather, rng: ctx.rng,
          forceCritical: false, forceRandom: 0.925,
        });
        expectedDamage = dmg.damage * (move.accuracy <= 0 ? 1 : move.accuracy / 100);
        if (move.effect?.multiHit) {
          const [min, max] = move.effect.multiHit;
          expectedDamage *= (min + max) / 2;
        }
        // Schaden relativ zu den Rest-KP des Ziels bewerten.
        score = (expectedDamage / Math.max(1, target.currentHp)) * 100;
        if (expectedDamage >= target.currentHp) score += 90;
        if (dmg.effectiveness === 0) score = -50;
        if (move.effect?.recoil) score -= move.effect.recoil * 20;
        if (move.priority > 0 && expectedDamage >= target.currentHp) score += 40;
        if (move.effect?.chargeTurn) score -= 25;
        if (move.effect?.rechargeTurn) score -= 12;
      }

      out.push({
        index: i, move, score, expectedDamage,
        killsTarget: expectedDamage >= target.currentHp,
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  private scoreStatusMove(
    ctx: AiContext, move: MoveData, self: Creature, target: Creature,
  ): number {
    const eff = move.effect;
    if (!eff) return 5;
    let score = 0;
    const selfHp = self.hpFraction;

    if (eff.heal) {
      // Heilen lohnt nur bei niedrigen KP.
      score += selfHp < 0.5 ? (1 - selfHp) * 110 : -30;
    }
    if (eff.status && eff.statusChance && eff.statusChance >= 1) {
      if (target.status !== 'none') score -= 60;
      else {
        const immune =
          (eff.status === 'burn' && target.types.includes('fire')) ||
          (eff.status === 'freeze' && target.types.includes('ice')) ||
          (eff.status === 'paralysis' && target.types.includes('electric')) ||
          ((eff.status === 'poison' || eff.status === 'toxic') &&
            (target.types.includes('poison') || target.types.includes('steel')));
        score += immune ? -60 : 46;
        if (eff.status === 'sleep' || eff.status === 'freeze') score += 14;
      }
    }
    if (eff.statChanges) {
      for (const c of eff.statChanges) {
        const own = c.target === 'self';
        const current = own
          ? ctx.self.volatile.stages[c.stat]
          : ctx.opponent.volatile.stages[c.stat];
        // Bereits hohe Stufen bringen kaum noch etwas.
        const headroom = own ? 6 - current : 6 + current;
        score += Math.sign(c.stages) * Math.min(6, headroom) * 6 * (own ? 1 : 0.9);
      }
      // Aufbauen lohnt nur, solange man gesund ist.
      if (selfHp < 0.35) score -= 30;
      if (ctx.turn > 6) score -= 12;
    }
    if (eff.protect) {
      score += ctx.self.volatile.protectStreak > 0 ? -40 : 18;
    }
    if (eff.weather) {
      score += ctx.weather === eff.weather ? -40 : 24;
    }
    if (eff.screen) {
      const active = eff.screen === 'physical'
        ? ctx.self.screens.physical : ctx.self.screens.special;
      score += active > 0 ? -40 : 28;
    }
    if (eff.confuse) score += target.status === 'none' ? 26 : 16;
    if (eff.healPartyStatus) {
      const sick = ctx.self.party.filter((c) => c.status !== 'none' && !c.isFainted).length;
      score += sick > 0 ? sick * 22 : -40;
    }
    if (eff.forceSwitch) score += 10;
    return score;
  }

  /** Setzt bei niedrigen KP einen Heiltrank ein. */
  private considerItem(ctx: AiContext, self: Creature): BattleAction | null {
    if (self.hpFraction > 0.32) return null;
    const healId = ctx.self.items.find((id) => {
      const item = GameData.items.tryGet(id);
      return item?.usableInBattle && item.effect?.kind === 'healHp';
    });
    if (!healId) return null;
    // Nicht heilen, wenn der Gegner ohnehin in einem Zug K.O. schlaegt.
    const target = active(ctx.opponent);
    const incoming = this.estimateIncomingDamage(ctx, target, self);
    const item = GameData.items.get(healId);
    const healAmount = item.effect?.kind === 'healHp'
      ? (typeof item.effect.amount === 'number' ? item.effect.amount : self.maxHp)
      : 0;
    if (incoming >= self.currentHp + healAmount) return null;
    return { kind: 'item', itemId: healId, targetIndex: ctx.self.activeIndex };
  }

  /** Wechselt bei klarem Typnachteil, wenn ein besserer Kandidat bereitsteht. */
  private considerSwitch(
    ctx: AiContext, self: Creature, target: Creature, scored: ScoredMove[],
  ): BattleAction | null {
    const bench = ctx.self.party
      .map((c, i) => ({ c, i }))
      .filter((e) => e.i !== ctx.self.activeIndex && !e.c.isFainted);
    if (bench.length === 0) return null;

    const incoming = this.estimateIncomingDamage(ctx, target, self);
    const bestOwn = scored[0]?.score ?? -100;
    const lethal = incoming >= self.currentHp;
    const outclassed = bestOwn < 22 && incoming > self.currentHp * 0.45;

    if (!lethal && !outclassed) return null;
    // Kann die aktive Kreatur den Gegner selbst noch ausschalten? Dann bleiben.
    if (scored[0]?.killsTarget && effectiveSpeed(self, ctx.self, ctx.weather)
        > effectiveSpeed(target, ctx.opponent, ctx.weather)) {
      return null;
    }

    let bestIndex = -1;
    let bestScore = bestOwn;
    for (const e of bench) {
      const offence = this.bestOffenceScore(e.c, target);
      const defence = 1 / Math.max(0.25, GameData.effectivenessAgainst(
        target.types[0]!, e.c.types,
      ));
      const score = offence * 0.75 + defence * 18;
      if (score > bestScore + 20) {
        bestScore = score;
        bestIndex = e.i;
      }
    }
    if (bestIndex < 0) return null;
    // Experten wechseln nicht blind: bei sehr niedrigen KP lieber angreifen.
    if (this.profile === 'smart' && ctx.rng.chance(0.3)) return null;
    return { kind: 'switch', partyIndex: bestIndex };
  }

  private bestOffenceScore(attacker: Creature, target: Creature): number {
    let best = 0;
    for (const slot of attacker.moves) {
      if (slot.pp <= 0) continue;
      const move = GameData.moves.tryGet(slot.moveId);
      if (!move || move.category === 'status') continue;
      const eff = GameData.effectivenessAgainst(move.type, target.types);
      const stab = attacker.types.includes(move.type) ? 1.5 : 1;
      best = Math.max(best, move.power * eff * stab / 10);
    }
    return best;
  }

  private estimateIncomingDamage(ctx: AiContext, attacker: Creature, defender: Creature): number {
    let worst = 0;
    for (const slot of attacker.moves) {
      if (slot.pp <= 0) continue;
      const move = GameData.moves.tryGet(slot.moveId);
      if (!move || move.category === 'status') continue;
      const dmg = calculateDamage({
        attacker, defender,
        attackerSide: ctx.opponent, defenderSide: ctx.self,
        move, weather: ctx.weather, rng: ctx.rng,
        forceCritical: false, forceRandom: 0.925,
      });
      worst = Math.max(worst, dmg.damage);
    }
    return worst;
  }

  private shouldGigantify(ctx: AiContext, self: Creature, target: Creature): boolean {
    if (this.profile === 'boss') return ctx.turn >= 1;
    // Gigantifizieren, sobald es einen Unterschied macht: gesunde Kreatur,
    // lohnender Gegner.
    if (self.hpFraction < 0.5) return false;
    if (target.hpFraction < 0.3) return false;
    return this.profile === 'expert' ? true : ctx.rng.chance(0.6);
  }

  private pickWithNoise(scored: ScoredMove[], rng: RNG): ScoredMove {
    const noise = { basic: 26, smart: 12, expert: 4, boss: 0, random: 60 }[this.profile] ?? 15;
    if (noise <= 0) return scored[0]!;
    const jittered = scored.map((s) => ({ s, v: s.score + rng.float(-noise, noise) }));
    jittered.sort((a, b) => b.v - a.v);
    return jittered[0]!.s;
  }
}
