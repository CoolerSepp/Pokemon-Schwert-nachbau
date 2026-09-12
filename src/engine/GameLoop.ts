import { GameConfig } from '@/core/Config';

export type LoopCallback = (deltaSeconds: number, elapsedSeconds: number) => void;

/**
 * Spielschleife mit getrennten Phasen.
 *
 * Feste Simulationsschritte fuer alles, was reproduzierbar sein muss
 * (Bewegung, Kollision, KI), variable Schritte fuer Darstellung
 * (Animation, Effekte, Kamera) - so bleibt das Spielverhalten unabhaengig
 * von der Bildrate.
 */
export class GameLoop {
  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private elapsed = 0;
  private frameCount = 0;
  private lastFrameMs = 16.7;

  /** Phasen in Ausfuehrungsreihenfolge (Anforderung 3). */
  readonly phases = {
    input: [] as LoopCallback[],
    fixed: [] as LoopCallback[],
    simulation: [] as LoopCallback[],
    ai: [] as LoopCallback[],
    animation: [] as LoopCallback[],
    effects: [] as LoopCallback[],
    camera: [] as LoopCallback[],
    render: [] as LoopCallback[],
    ui: [] as LoopCallback[],
  };

  on(phase: keyof GameLoop['phases'], cb: LoopCallback): () => void {
    this.phases[phase].push(cb);
    return () => {
      const list = this.phases[phase];
      const idx = list.indexOf(cb);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);
      this.step(now);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  get isRunning(): boolean { return this.running; }
  get frameMs(): number { return this.lastFrameMs; }
  get frames(): number { return this.frameCount; }
  get elapsedSeconds(): number { return this.elapsed; }

  /** Einzelschritt - fuer Tests und fuer das schrittweise Debuggen. */
  step(now: number): void {
    const rawDelta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.lastFrameMs = rawDelta * 1000;
    // Nach einem Tab-Wechsel keinen Riesensprung simulieren.
    const delta = Math.min(rawDelta, GameConfig.loop.maxDeltaSeconds);
    this.elapsed += delta;
    this.frameCount++;

    this.run(this.phases.input, delta);

    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= GameConfig.loop.fixedStep
      && steps < GameConfig.loop.maxFixedStepsPerFrame) {
      this.run(this.phases.fixed, GameConfig.loop.fixedStep);
      this.accumulator -= GameConfig.loop.fixedStep;
      steps++;
    }
    if (steps >= GameConfig.loop.maxFixedStepsPerFrame) this.accumulator = 0;

    this.run(this.phases.simulation, delta);
    this.run(this.phases.ai, delta);
    this.run(this.phases.animation, delta);
    this.run(this.phases.effects, delta);
    this.run(this.phases.camera, delta);
    this.run(this.phases.render, delta);
    this.run(this.phases.ui, delta);
  }

  private run(callbacks: LoopCallback[], delta: number): void {
    for (let i = 0; i < callbacks.length; i++) {
      callbacks[i]!(delta, this.elapsed);
    }
  }
}
