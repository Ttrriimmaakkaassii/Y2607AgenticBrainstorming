export interface SceneSeat {
  xPct: number;
  yPct: number;
  scale: number;
}

export interface SceneDef {
  id: string;
  label: string;
  icon: string;
  background: string;
  /** Returns one seat per agent, in the same order as the agents array. */
  layout: (count: number) => SceneSeat[];
}

function circle(count: number, cx: number, cy: number, rx: number, ry: number, startDeg = -90): SceneSeat[] {
  if (count <= 0) return [];
  const seats: SceneSeat[] = [];
  for (let i = 0; i < count; i++) {
    const angle = ((startDeg + (360 / count) * i) * Math.PI) / 180;
    seats.push({
      xPct: cx + Math.cos(angle) * rx,
      yPct: cy + Math.sin(angle) * ry,
      scale: 1,
    });
  }
  return seats;
}

function row(count: number, y: number, spread = 80, scale = 1): SceneSeat[] {
  if (count <= 0) return [];
  if (count === 1) return [{ xPct: 50, yPct: y, scale }];
  const step = spread / (count - 1);
  const start = 50 - spread / 2;
  return Array.from({ length: count }, (_, i) => ({ xPct: start + step * i, yPct: y, scale }));
}

function grid(count: number, cols: number, cellW: number, cellH: number, originX: number, originY: number): SceneSeat[] {
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const rowIdx = Math.floor(i / cols);
    return { xPct: originX + col * cellW, yPct: originY + rowIdx * cellH, scale: 1 };
  });
}

/** Deterministic pseudo-random jitter so "scattered" layouts stay stable across re-renders. */
function jitter(seed: number, amplitude: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * amplitude;
}

export const SCENES: SceneDef[] = [
  {
    id: 'roundtable',
    label: 'Round Table',
    icon: '⭕',
    background: 'radial-gradient(circle at 50% 45%, #3d2b1f 0%, #241a12 60%, #120d09 100%)',
    layout: (n) => circle(n, 50, 48, 34, 26),
  },
  {
    id: 'picnic',
    label: 'Picnic',
    icon: '🧺',
    background: 'linear-gradient(180deg, #bfe6ff 0%, #bfe6ff 35%, #8fd48a 35%, #6bbf63 100%)',
    layout: (n) =>
      Array.from({ length: n }, (_, i) => ({
        xPct: 50 + jitter(i + 1, 30),
        yPct: 55 + jitter(i + 7, 20),
        scale: 0.95,
      })),
  },
  {
    id: 'boardroom',
    label: 'Boardroom',
    icon: '💼',
    background: 'linear-gradient(180deg, #2a2f36 0%, #1b1e23 100%)',
    layout: (n) => {
      if (n === 0) return [];
      const head: SceneSeat = { xPct: 50, yPct: 18, scale: 1.1 };
      const rest = row(Math.max(n - 1, 0), 62, 74, 1);
      return [head, ...rest].slice(0, n);
    },
  },
  {
    id: 'lounge',
    label: 'Lounge',
    icon: '🛋️',
    background: 'linear-gradient(180deg, #4a3728 0%, #2c2018 100%)',
    layout: (n) =>
      Array.from({ length: n }, (_, i) => ({
        xPct: 20 + ((i * 60) / Math.max(n - 1, 1)) * (n > 1 ? 1 : 0) + (n === 1 ? 30 : 0),
        yPct: 45 + (i % 2 === 0 ? 0 : 14),
        scale: 1,
      })),
  },
  {
    id: 'campfire',
    label: 'Campfire',
    icon: '🔥',
    background: 'radial-gradient(circle at 50% 55%, #3a2410 0%, #140b04 55%, #050302 100%)',
    layout: (n) => circle(n, 50, 55, 30, 22),
  },
  {
    id: 'debate',
    label: 'Debate Stage',
    icon: '🎙️',
    background: 'linear-gradient(180deg, #1a1a2e 0%, #0d0d18 100%)',
    layout: (n) => row(n, 55, 70, 1.05),
  },
  {
    id: 'coffeeshop',
    label: 'Coffee Shop',
    icon: '☕',
    background: 'linear-gradient(180deg, #e8d5c0 0%, #d4b998 100%)',
    layout: (n) =>
      Array.from({ length: n }, (_, i) => ({
        xPct: 20 + (i % 3) * 30 + jitter(i + 3, 6),
        yPct: 30 + Math.floor(i / 3) * 30 + jitter(i + 11, 6),
        scale: 0.95,
      })),
  },
  {
    id: 'zen',
    label: 'Zen Garden',
    icon: '🪴',
    background: 'linear-gradient(180deg, #e8e2d0 0%, #d6cfb8 100%)',
    layout: (n) => grid(n, Math.min(n, 4) || 1, 22, 26, 22, 28),
  },
];

export function getScene(id: string): SceneDef {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}
