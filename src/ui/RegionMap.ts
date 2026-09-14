import type { AreaData } from '@/data/schema';

export interface MapNode {
  area: AreaData;
  /** Position in Prozent der Kartenflaeche. */
  x: number;
  y: number;
  visited: boolean;
  current: boolean;
  selected: boolean;
  /** Arena vorhanden? */
  gym: boolean;
  /** Energiepunkte vorhanden? */
  dens: number;
}

/** Farbgebung der Karte - warm wie eine gezeichnete Wanderkarte. */
const COLORS = {
  sea: '#2f6d94',
  seaDeep: '#24506e',
  land: '#d9cba6',
  landShade: '#c7b28a',
  grass: '#9fc16f',
  forest: '#6d9a52',
  rock: '#a99a86',
  snow: '#e8eef2',
  water: '#5fa8c9',
  route: '#c9a96c',
  routeLine: '#a8854f',
  ink: '#4a3b2a',
  unknown: '#8c8474',
};

/**
 * Zeichnet die Regionskarte auf ein Canvas.
 *
 * Bewusst als gezeichnete Karte und nicht als Punktdiagramm: Landmasse,
 * Kuestenlinie, Wege und Ortszeichen machen auf einen Blick klar, wie die
 * Region zusammenhaengt. Unbesuchte Orte bleiben als Schemen sichtbar, damit
 * erkennbar ist, dass dort noch etwas wartet.
 */
export function drawRegionMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nodes: MapNode[],
): void {
  ctx.clearRect(0, 0, width, height);
  const px = (value: number) => (value / 100) * width;
  const py = (value: number) => (value / 100) * height;

  drawSea(ctx, width, height);
  drawLand(ctx, width, height, nodes, px, py);
  drawRoutes(ctx, nodes, px, py);
  for (const node of nodes) drawNode(ctx, node, px(node.x), py(node.y));
  drawCompass(ctx, width, height);
}

function drawSea(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, COLORS.seaDeep);
  gradient.addColorStop(1, COLORS.sea);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Angedeutete Wellen.
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1.5;
  for (let y = 12; y < height; y += 26) {
    ctx.beginPath();
    for (let x = 0; x <= width; x += 12) {
      const wave = Math.sin((x + y) * 0.035) * 3;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
}

/** Landmasse als Vereinigung weicher Kreise um alle Orte. */
function drawLand(
  ctx: CanvasRenderingContext2D, width: number, height: number, nodes: MapNode[],
  px: (v: number) => number, py: (v: number) => number,
): void {
  const radius = Math.min(width, height) * 0.14;

  // Kuestenlinie: dieselbe Form zweimal, einmal breiter als Schatten.
  for (const pass of ['coast', 'land'] as const) {
    ctx.save();
    ctx.beginPath();
    for (const node of nodes) {
      const r = radius * (node.area.kind === 'wildarea' ? 1.5 : 1);
      ctx.moveTo(px(node.x) + r, py(node.y));
      ctx.arc(px(node.x), py(node.y), r, 0, Math.PI * 2);
    }
    if (pass === 'coast') {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 10;
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      ctx.fillStyle = COLORS.land;
      ctx.fill();
      ctx.clip();
      // Gelaendetoene innerhalb der Landmasse.
      for (const node of nodes) {
        const color = terrainColor(node.area.kind);
        if (!color) continue;
        const r = radius * (node.area.kind === 'wildarea' ? 1.6 : 1.05);
        const gradient = ctx.createRadialGradient(
          px(node.x), py(node.y), r * 0.1, px(node.x), py(node.y), r,
        );
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.globalAlpha = node.visited ? 0.85 : 0.4;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

function terrainColor(kind: string): string | null {
  switch (kind) {
    case 'forest': return COLORS.forest;
    case 'wildarea': return COLORS.grass;
    case 'route': return COLORS.grass;
    case 'cave': return COLORS.rock;
    case 'mountain': return COLORS.rock;
    case 'snow': return COLORS.snow;
    case 'lake': return COLORS.water;
    default: return null;
  }
}

/** Wege zwischen verbundenen Orten. */
function drawRoutes(
  ctx: CanvasRenderingContext2D, nodes: MapNode[],
  px: (v: number) => number, py: (v: number) => number,
): void {
  const byId = new Map(nodes.map((n) => [n.area.id, n]));
  const drawn = new Set<string>();

  for (const node of nodes) {
    for (const conn of node.area.connections) {
      const target = byId.get(conn.to);
      if (!target) continue;
      const key = [node.area.id, conn.to].sort().join('>');
      if (drawn.has(key)) continue;
      drawn.add(key);

      const known = node.visited && target.visited;
      ctx.strokeStyle = known ? COLORS.routeLine : 'rgba(74,59,42,0.3)';
      ctx.lineWidth = known ? 7 : 4;
      ctx.lineCap = 'round';
      ctx.setLineDash(known ? [] : [7, 7]);
      ctx.beginPath();
      ctx.moveTo(px(node.x), py(node.y));
      ctx.lineTo(px(target.x), py(target.y));
      ctx.stroke();

      if (known) {
        // Heller Kern: der Weg wirkt dadurch begangen.
        ctx.strokeStyle = COLORS.route;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(px(node.x), py(node.y));
        ctx.lineTo(px(target.x), py(target.y));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }
}

/** Ortszeichen samt Beschriftung. */
function drawNode(ctx: CanvasRenderingContext2D, node: MapNode, x: number, y: number): void {
  const size = node.current ? 15 : node.area.kind === 'route' ? 7 : 12;

  if (!node.visited) {
    ctx.fillStyle = 'rgba(30,26,20,0.55)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y + 1);
    return;
  }

  ctx.save();
  ctx.translate(x, y);
  if (node.selected) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, size + 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2;
  switch (node.area.kind) {
    case 'town':
    case 'city': {
      // Haus mit Satteldach; Staedte bekommen ein zweites, kleineres Haus.
      drawHouse(ctx, 0, 0, size);
      if (node.area.kind === 'city') drawHouse(ctx, size * 0.85, size * 0.3, size * 0.66);
      break;
    }
    case 'league':
    case 'stadium':
      drawStar(ctx, 0, 0, size + 2);
      break;
    case 'cave':
      ctx.fillStyle = COLORS.rock;
      ctx.beginPath();
      ctx.moveTo(-size, size * 0.7);
      ctx.lineTo(0, -size);
      ctx.lineTo(size, size * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3a2f28';
      ctx.beginPath();
      ctx.ellipse(0, size * 0.55, size * 0.36, size * 0.3, 0, Math.PI, 0);
      ctx.fill();
      break;
    case 'forest':
      drawTree(ctx, -size * 0.5, 0, size * 0.8);
      drawTree(ctx, size * 0.5, size * 0.15, size * 0.95);
      break;
    case 'lake':
      ctx.fillStyle = COLORS.water;
      ctx.beginPath();
      ctx.ellipse(0, 0, size, size * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'wildarea':
      ctx.fillStyle = COLORS.grass;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawTree(ctx, 0, 0, size * 0.8);
      break;
    case 'endgame':
      ctx.fillStyle = '#7a4fa8';
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.8, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size * 0.8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    default:
      ctx.fillStyle = COLORS.route;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
  }

  // Arenamarke
  if (node.gym) {
    ctx.fillStyle = '#e8b33f';
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(size * 0.95, -size * 0.95, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Energiepunkte
  if (node.dens > 0) {
    ctx.fillStyle = '#ff5ea8';
    ctx.beginPath();
    ctx.arc(-size * 0.95, -size * 0.95, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Aktuelle Position: pulsierender Ring.
  if (node.current) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, size + 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -size - 18, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Beschriftung mit Kontur, damit sie auf jedem Untergrund lesbar bleibt.
  ctx.font = node.area.kind === 'route'
    ? '11px system-ui, sans-serif'
    : 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(20,16,12,0.8)';
  const labelY = y + size + (node.area.kind === 'route' ? 9 : 6);
  ctx.strokeText(node.area.name, x, labelY);
  ctx.fillStyle = node.selected ? '#ffffff' : '#f0e6d2';
  ctx.fillText(node.area.name, x, labelY);
}

function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = '#f2ece0';
  ctx.beginPath();
  ctx.rect(x - size * 0.6, y - size * 0.1, size * 1.2, size * 0.9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#b5533f';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.8, y - size * 0.1);
  ctx.lineTo(x, y - size * 0.9);
  ctx.lineTo(x + size * 0.8, y - size * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = '#5f4030';
  ctx.fillRect(x - size * 0.12, y, size * 0.24, size * 0.7);
  ctx.fillStyle = COLORS.forest;
  ctx.beginPath();
  ctx.arc(x, y - size * 0.2, size * 0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = '#ffd76b';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? size : size * 0.46;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Kompassrose in der Ecke. */
function drawCompass(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const x = width - 44;
  const y = height - 44;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(20,16,12,0.45)';
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  // Nadel: rote Nordhaelfte, helle Suedhaelfte.
  ctx.fillStyle = '#d8584b';
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(5, 0);
  ctx.lineTo(-5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f0e6d2';
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(5, 0);
  ctx.lineTo(-5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f0e6d2';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', 0, -21);
  ctx.restore();
}
