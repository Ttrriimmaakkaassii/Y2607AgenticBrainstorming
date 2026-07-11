/**
 * Dev Mode reference-code attribute helper. Every call returns a unique,
 * purely numeric-suffixed code ("S1", "S2", ...) instead of a hand-picked
 * name — codes are assigned automatically by call order within a render
 * pass, so there's no manual bookkeeping and no risk of two elements
 * accidentally sharing a code. Visibility is gated purely by CSS
 * (`body.dev-mode [data-devref]` in globals.css), toggled by ChatApp when
 * the user enables Dev Mode.
 *
 * The counter resets at the start of ChatApp's render (see
 * resetDevRefCounter, called at the top of the ChatApp function body) so
 * the same element gets the same code across renders, as long as the
 * surrounding JSX tree shape hasn't changed (e.g. a conditional section
 * toggling open/closed will shift the numbers after it — expected for a
 * debug aid, not meant to be a permanent stable id).
 */

let counter = 0;

export function resetDevRefCounter(): void {
  counter = 0;
}

export function devRef(): { 'data-devref': string } {
  counter += 1;
  return { 'data-devref': `S${counter}` };
}
