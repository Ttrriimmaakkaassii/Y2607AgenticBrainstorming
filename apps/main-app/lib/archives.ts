import { ArchivedConversation, ConversationState } from './types';

const STORAGE_KEY = 'multi-agent-conversation-archives';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** e.g. Y2607 for July 2026 */
function yymmPrefix(date: Date): string {
  const yy = pad2(date.getFullYear() % 100);
  const mm = pad2(date.getMonth() + 1);
  return `Y${yy}${mm}`;
}

/** e.g. _Y260726 for 2026-07-26 */
function yymmddSuffix(date: Date): string {
  const yy = pad2(date.getFullYear() % 100);
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  return `_Y${yy}${mm}${dd}`;
}

export function buildArchiveTitle(userTitle: string, state: ConversationState): string {
  const now = new Date();
  const allMessages = state.threads.flatMap((t) => t.messages);
  const lastInteraction = allMessages.length
    ? new Date(Math.max(...allMessages.map((m) => m.timestamp)))
    : now;
  return `${yymmPrefix(now)}${userTitle}${yymmddSuffix(lastInteraction)}`;
}

export function loadArchives(): ArchivedConversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ArchivedConversation[]) : [];
    return parsed.map((a) => ({
      ...a,
      category: a.category ?? null,
      color: a.color ?? null,
    }));
  } catch {
    return [];
  }
}

export function saveArchives(archives: ArchivedConversation[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(archives));
}
