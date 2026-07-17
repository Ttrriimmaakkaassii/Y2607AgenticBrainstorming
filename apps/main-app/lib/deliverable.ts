import { DeliverableResult, DeliverableType } from './types';

/**
 * Deliverable acceptance gates — structural validators by deliverable type.
 * A deliverable is accepted only when it passes ALL required checks.
 * Structural (shape/presence), not semantic (can't judge correctness — that
 * needs human or LLM review). If validation fails, exact rejection reasons
 * are returned so the responsible agent can fix the gaps.
 */

const MIN_LENGTH = 50;

export function validateDeliverable(type: DeliverableType, content: string): DeliverableResult {
  const reasons: string[] = [];
  const text = content.trim();

  if (text.length < MIN_LENGTH) {
    reasons.push(`Deliverable is too short (${text.length} chars, need ≥ ${MIN_LENGTH}).`);
  }

  switch (type) {
    case 'research_evidence':
      // Must reference at least one source URL.
      if (!/https?:\/\/\S+/i.test(text)) {
        reasons.push('Research deliverable must include at least one source URL.');
      }
      // Must not be raw tool markup only.
      if (/<｜｜DSML｜｜|<tool_call>|<function_call>/i.test(text)) {
        reasons.push('Deliverable contains raw tool-call markup — extract results into prose first.');
      }
      break;

    case 'comparison':
      // Must have at least 2 comparable items (heuristic: numbers/labels).
      const numbers = text.match(/\d[\d.,]*\s*(?:%|usd|\$|eur|gbp|m2|m²|sqm|km| miles)?/gi);
      if (!numbers || numbers.length < 2) {
        reasons.push('Comparison deliverable needs at least 2 comparable data points.');
      }
      break;

    case 'recommendation':
      // Must mention at least one risk or limitation.
      if (!/(risk|limitation|caveat|unknown|uncertain|assumption|disclaimer)/i.test(text)) {
        reasons.push('Recommendation must state at least one risk, limitation, or uncertainty.');
      }
      break;

    case 'general':
    default:
      // No extra checks beyond minimum length.
      break;
  }

  return { accepted: reasons.length === 0, reasons };
}
