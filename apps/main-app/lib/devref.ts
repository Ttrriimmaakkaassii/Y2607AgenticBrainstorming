/**
 * Dev Mode reference-code attribute helper. Each call site is given a
 * FIXED, hand-assigned code baked into the source (e.g. `devRef('b12')`) —
 * not a runtime-computed value. This is deliberate: a code must always
 * point back to the same call site so that when the user reports a code
 * (e.g. "b4323"), it can be traced to an exact section by reading the
 * source, regardless of how many agents/messages/etc. exist at runtime.
 *
 * Codes are `<letter-prefix><number>`, where the prefix identifies the
 * element's TYPE (numbered independently per prefix, so "s5" and "b5" are
 * unrelated, both valid at once):
 *   s  = Section (a modal-section, or a major layout block like the header,
 *        search bar, controls panel, conversation area)
 *   dr = Dropdown (a <select>, or a custom multi-select/menu popover like
 *        the Moods/Participants/Categories manager panels)
 *   b  = Button
 *   i  = Input (text/password/number/color/file/range — anything that
 *        isn't specifically a checkbox or textarea)
 *   t  = Textarea
 *   ck = Checkbox
 *   r  = Row (a list-item / table-row container)
 *
 * For a call site inside a list (.map()), pass the loop index as the
 * second argument so each rendered instance still gets a distinct
 * `data-devref` ("b12-0", "b12-1", ...) while the base code stays traceable
 * to that one call site in the source. The visible badge only ever shows
 * the base code (`data-devref-label`), never the "-index"/"-agentId" suffix
 * — that suffix can be a long id, and reading it out loud isn't the point;
 * tracing back to the call site is.
 *
 * Visibility is gated purely by CSS (`body.dev-mode [data-devref]` in
 * globals.css), toggled by ChatApp when the user enables Dev Mode.
 */
export function devRef(code: string, index?: number | string): { 'data-devref': string; 'data-devref-label': string } {
  return {
    'data-devref': index != null ? `${code}-${index}` : code,
    'data-devref-label': code,
  };
}
