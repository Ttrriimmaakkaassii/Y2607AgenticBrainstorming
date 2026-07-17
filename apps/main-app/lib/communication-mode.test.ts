import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGlobalCommunicationMode,
  saveGlobalCommunicationMode,
  loadGlobalA2ADisplayMode,
  saveGlobalA2ADisplayMode,
  effectiveCommunicationMode,
  effectiveA2ADisplayMode,
  DEFAULT_COMMUNICATION_MODE,
} from './communication-mode';

// vitest runs in the `node` environment (no window/localStorage). Stub a
// minimal localStorage + window so the SSR-guarded module behaves as in-browser.
function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

describe('communication-mode persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: makeStorage() });
  });

  it('defaults to natural_language / a2a_readable when nothing is stored', () => {
    expect(loadGlobalCommunicationMode()).toBe(DEFAULT_COMMUNICATION_MODE);
    expect(loadGlobalA2ADisplayMode()).toBe('a2a_readable');
  });

  it('round-trips a saved mode', () => {
    saveGlobalCommunicationMode('a2a');
    expect(loadGlobalCommunicationMode()).toBe('a2a');
    saveGlobalCommunicationMode('natural_language');
    expect(loadGlobalCommunicationMode()).toBe('natural_language');
  });

  it('round-trips a saved display mode', () => {
    saveGlobalA2ADisplayMode('a2a_raw');
    expect(loadGlobalA2ADisplayMode()).toBe('a2a_raw');
  });

  it('ignores garbage values and falls back to the default', () => {
    window.localStorage.setItem('multi-agent-communication-mode', 'telepathy');
    expect(loadGlobalCommunicationMode()).toBe(DEFAULT_COMMUNICATION_MODE);
  });

  it('effective mode prefers the conversation setting over the global default', () => {
    saveGlobalCommunicationMode('a2a');
    expect(effectiveCommunicationMode('natural_language')).toBe('natural_language');
    expect(effectiveCommunicationMode(undefined)).toBe('a2a');
  });

  it('effectiveA2ADisplayMode falls back to the global default', () => {
    saveGlobalA2ADisplayMode('a2a_raw');
    expect(effectiveA2ADisplayMode(undefined)).toBe('a2a_raw');
    expect(effectiveA2ADisplayMode('natural_language')).toBe('natural_language');
  });

  it('is SSR-safe (no window → default)', () => {
    vi.unstubAllGlobals(); // remove window
    expect(loadGlobalCommunicationMode()).toBe(DEFAULT_COMMUNICATION_MODE);
  });
});
