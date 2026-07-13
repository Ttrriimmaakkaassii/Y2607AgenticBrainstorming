/** Darkens (negative percent) or lightens (positive) a #rrggbb color. Falls back to the input for non-hex values. */
export function shadeColor(hex: string, percent: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/** Picks whichever of black/white reads better on top of `hex`, via the
 * standard relative-luminance heuristic. Falls back to white for non-hex
 * values (matches the previous fixed-white behavior). */
export function contrastTextColor(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff';
  const num = parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  // Perceived brightness (ITU-R BT.601) — cheaper than true relative
  // luminance, but plenty accurate for a binary light/dark text choice.
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? '#111111' : '#ffffff';
}
