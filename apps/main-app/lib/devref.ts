/**
 * Dev Mode reference-code attribute helper. Each call site is given a
 * FIXED, hand-assigned numeric code baked into the source (e.g.
 * `devRef('42')`) — not a runtime-computed value. This is deliberate: a
 * code must always point back to the same call site so that when the user
 * reports a code (e.g. "a4323"), it can be traced to an exact section by
 * reading the source, regardless of how many agents/messages/etc. exist at
 * runtime. A previous runtime-auto-incrementing version was reverted
 * because it made codes meaningless outside the exact render that produced
 * them.
 *
 * For a call site inside a list (.map()), pass the loop index as the
 * second argument so each rendered instance still gets a distinct code
 * ("42-0", "42-1", ...) while the base code stays traceable to that one
 * call site in the source.
 *
 * Visibility is gated purely by CSS (`body.dev-mode [data-devref]` in
 * globals.css), toggled by ChatApp when the user enables Dev Mode.
 */
export function devRef(code: string, index?: number | string): { 'data-devref': string } {
  return { 'data-devref': index != null ? `${code}-${index}` : code };
}
