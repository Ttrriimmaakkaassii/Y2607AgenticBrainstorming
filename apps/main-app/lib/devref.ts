/**
 * Dev Mode reference-code attribute helper. Always attaches the attribute —
 * visibility is gated purely by CSS (`body.dev-mode [data-devref]` in
 * globals.css), toggled by ChatApp when the user enables Dev Mode. This
 * lets any component in the tree tag its fields without needing devMode
 * state passed down to it.
 */
export function devRef(code: string): { 'data-devref': string } {
  return { 'data-devref': code };
}
