export interface SceneSeat {
  xPct: number;
  yPct: number;
  scale: number;
}

/** Single cinematic backdrop — the old per-scenery picker was dropped since
 * the different layouts all read the same once agents are on screen. */
export const SCENE_BACKGROUND =
  'radial-gradient(circle at 50% 30%, rgba(255,196,120,0.14) 0%, rgba(255,196,120,0) 45%), radial-gradient(ellipse at 50% 48%, #3d3a52 0%, #201e2e 45%, #121120 78%, #08070d 100%)';

/** Default seating: everyone arranged in a circle, closest thing to a
 * neutral "round table" that works for any agent count. */
export function circleLayout(count: number, cx = 50, cy = 48, rx = 34, ry = 26, startDeg = -90): SceneSeat[] {
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
