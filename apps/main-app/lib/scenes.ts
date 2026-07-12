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
    background:
      'radial-gradient(circle at 50% 30%, rgba(255,196,120,0.18) 0%, rgba(255,196,120,0) 45%), radial-gradient(ellipse at 50% 48%, #4a3625 0%, #2a1d13 45%, #140d08 78%, #080503 100%)',
    layout: (n) => circle(n, 50, 48, 34, 26),
  },
  {
    id: 'picnic',
    label: 'Picnic',
    icon: '🧺',
    background:
      'radial-gradient(circle at 50% 12%, rgba(255,250,220,0.55) 0%, rgba(255,250,220,0) 40%), linear-gradient(180deg, #a9dcff 0%, #cdeaff 30%, #8fd48a 35%, #57a851 70%, #3f8a3c 100%)',
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
    background:
      'radial-gradient(ellipse at 50% 0%, rgba(150,180,220,0.16) 0%, rgba(150,180,220,0) 55%), linear-gradient(180deg, #343b46 0%, #23272e 45%, #14171c 100%)',
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
    background:
      'radial-gradient(circle at 30% 20%, rgba(255,190,120,0.2) 0%, rgba(255,190,120,0) 45%), linear-gradient(160deg, #5a4230 0%, #3a2a1c 55%, #201509 100%)',
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
    background:
      'radial-gradient(circle at 50% 60%, rgba(255,140,40,0.35) 0%, rgba(255,90,20,0.12) 30%, rgba(255,90,20,0) 55%), radial-gradient(circle at 50% 55%, #3a2410 0%, #140b04 55%, #030201 100%)',
    layout: (n) => circle(n, 50, 55, 30, 22),
  },
  {
    id: 'debate',
    label: 'Debate Stage',
    icon: '🎙️',
    background:
      'radial-gradient(ellipse at 50% 30%, rgba(120,140,255,0.22) 0%, rgba(120,140,255,0) 55%), linear-gradient(180deg, #22223a 0%, #14141f 55%, #08080d 100%)',
    layout: (n) => row(n, 55, 70, 1.05),
  },
  {
    id: 'coffeeshop',
    label: 'Coffee Shop',
    icon: '☕',
    background:
      'radial-gradient(circle at 50% 10%, rgba(255,240,210,0.5) 0%, rgba(255,240,210,0) 40%), linear-gradient(180deg, #f0ddc4 0%, #dcc09a 55%, #c2a179 100%)',
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
    background:
      'radial-gradient(circle at 50% 8%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 40%), linear-gradient(180deg, #eee7d4 0%, #dcd3b4 55%, #c7bb96 100%)',
    layout: (n) => grid(n, Math.min(n, 4) || 1, 22, 26, 22, 28),
  },
];

export function getScene(id: string): SceneDef {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}
