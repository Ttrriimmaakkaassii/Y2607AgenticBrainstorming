import { Message } from './types';

export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2;

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.5, 1, 1.5, 2];

/** Only agent messages are seatable events — user messages don't have an avatar in the scene. */
export function buildSceneTimeline(messages: Message[]): Message[] {
  return messages.filter((m) => m.agentId !== 'user').sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * How long a replayed message should stay focused, before speed is applied.
 * Scales with content length so short quips don't linger and long replies
 * get enough time to be read, within a sane floor/ceiling.
 */
export function messageDurationMs(content: string): number {
  const base = 1800;
  const perChar = 35;
  const raw = base + content.length * perChar;
  return Math.max(2200, Math.min(raw, 9000));
}
