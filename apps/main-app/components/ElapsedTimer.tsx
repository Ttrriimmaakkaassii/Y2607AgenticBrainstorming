'use client';

import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/agent-timing';

/**
 * Live elapsed-time counter shown while an agent is processing. Self-ticks via
 * setInterval(100ms) while mounted and cleans up on unmount — so each agent
 * gets its OWN independent timer, concurrent agents don't interfere, and the
 * counter survives React rerenders (it reads the stable start instant, not a
 * render-time value). When the agent finishes, this component unmounts and the
 * final duration already stored on the message takes over ("Responded in Xs").
 */
export function ElapsedTimer({
  startedMs,
  prefix = '',
  suffix = '',
}: {
  startedMs: number;
  prefix?: string;
  suffix?: string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);
  const elapsed = Date.now() - startedMs;
  return (
    <span className="elapsed-timer" aria-live="polite">
      {prefix}
      {formatDuration(elapsed)}
      {suffix}
    </span>
  );
}
