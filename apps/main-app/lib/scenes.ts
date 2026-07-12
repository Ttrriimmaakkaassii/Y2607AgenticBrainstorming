export interface SceneSeat {
  xPct: number;
  yPct: number;
  scale: number;
}

/** Single cinematic backdrop — the old per-scenery picker was dropped since
 * the different layouts all read the same once agents are on screen. */
export const SCENE_BACKGROUND =
  'radial-gradient(circle at 50% 30%, rgba(255,196,120,0.14) 0%, rgba(255,196,120,0) 45%), radial-gradient(ellipse at 50% 48%, #3d3a52 0%, #201e2e 45%, #121120 78%, #08070d 100%)';

/** Overrides an avatar's own preset color: green while actively speaking, red while being addressed by the speaker. */
export const SPEAKING_COLOR = '#22c55e';
export const ADDRESSED_COLOR = '#ef4444';

/** Default seating: agents line the far left and far right edges only,
 * alternating sides, evenly spaced top-to-bottom on each side — never
 * stacked directly above/below one another and never blocking the central
 * bubble that sits at 50%/50%. */
export function sideLayout(count: number): SceneSeat[] {
  if (count <= 0) return [];
  const seats: SceneSeat[] = new Array(count);
  const leftIdxs: number[] = [];
  const rightIdxs: number[] = [];
  for (let i = 0; i < count; i++) {
    (i % 2 === 0 ? leftIdxs : rightIdxs).push(i);
  }

  const place = (idxs: number[], xPct: number) => {
    idxs.forEach((agentIdx, pos) => {
      const yPct = idxs.length === 1 ? 50 : 18 + (64 * pos) / (idxs.length - 1);
      seats[agentIdx] = { xPct, yPct, scale: 1 };
    });
  };

  place(leftIdxs, 12);
  place(rightIdxs, 88);
  return seats;
}
