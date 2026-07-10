'use client';

import { useEffect, useRef } from 'react';
import { Agent, Message } from '@/lib/types';

interface AudioRailProps {
  agents: Agent[];
  messages: Message[];
  speakingMessageId: string | null;
  onPlayFrom: (index: number) => void;
  onStop: () => void;
}

function authorLabel(agents: Agent[], agentId: string): string {
  if (agentId === 'user') return 'You';
  const agent = agents.find((a) => a.id === agentId);
  return agent ? agent.refNumber : 'Unknown';
}

export function AudioRail({ agents, messages, speakingMessageId, onPlayFrom, onStop }: AudioRailProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [speakingMessageId]);

  if (messages.length === 0) return null;

  return (
    <div className="audio-rail">
      <div className="audio-rail-header">
        <span>🎙️ Read Aloud</span>
        {speakingMessageId && (
          <button className="btn-icon" title="Stop" onClick={onStop}>
            ⏹️
          </button>
        )}
      </div>
      {messages.map((msg, i) => (
        <button
          key={msg.id}
          ref={msg.id === speakingMessageId ? activeRef : undefined}
          className={`audio-rail-item ${msg.id === speakingMessageId ? 'speaking' : ''}`}
          onClick={() => onPlayFrom(i)}
          title={`Play from: ${msg.content.slice(0, 60)}`}
        >
          <span className="audio-rail-author">
            {msg.id === speakingMessageId && <span className="speaking-dot">🔊</span>}
            {authorLabel(agents, msg.agentId)}
          </span>
          <span className="audio-rail-snippet">{msg.content.slice(0, 36)}</span>
        </button>
      ))}
    </div>
  );
}
