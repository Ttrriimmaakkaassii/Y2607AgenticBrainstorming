'use client';

import { Agent, Feedback, Message, ReactionType } from '@/lib/types';
import { TraitDef } from '@/lib/traits';
import { SceneSeat } from '@/lib/scenes';
import { useTypewriter } from '@/lib/use-typewriter';
import { AGENT_REACTIONS } from '@/lib/reactions';

const FEEDBACK_ICONS: { type: Feedback; icon: string }[] = [
  { type: 'like', icon: '👍' },
  { type: 'dislike', icon: '👎' },
  { type: 'clarify', icon: '🤔' },
];

function traitValue(agent: Agent, traitDefs: TraitDef[], pattern: RegExp): number {
  const def = traitDefs.find((d) => pattern.test(d.name));
  if (!def) return 50;
  return agent.traits?.[def.id] ?? 50;
}

interface SceneAvatarProps {
  agent: Agent;
  seat: SceneSeat;
  traitDefs: TraitDef[];
  isSpeaking: boolean;
  isFocused: boolean;
  lastMessage?: Message;
  onFocus: () => void;
  onFeedback: (message: Message, type: Feedback) => void;
  onReaction: (message: Message, type: ReactionType) => void;
  onReply: (message: Message) => void;
}

export function SceneAvatar({
  agent,
  seat,
  traitDefs,
  isSpeaking,
  isFocused,
  lastMessage,
  onFocus,
  onFeedback,
  onReaction,
  onReply,
}: SceneAvatarProps) {
  const formality = traitValue(agent, traitDefs, /formal/i);
  const energy = traitValue(agent, traitDefs, /aggress|energ|assert/i);
  const bodyRadius = 24 - Math.round((formality / 100) * 18);
  const pulseSpeed = 1.4 - (energy / 100) * 0.7;
  const bubbleText = useTypewriter(lastMessage?.content ?? '');

  return (
    <div
      className={`scene-avatar-slot ${isFocused ? 'focused' : ''} ${isSpeaking ? 'speaking' : ''}`}
      style={{ left: `${seat.xPct}%`, top: `${seat.yPct}%`, transform: `translate(-50%, -50%) scale(${seat.scale})` }}
      onClick={onFocus}
    >
      {lastMessage && (
        <div className={`scene-speech-bubble ${isFocused ? 'expanded' : ''}`}>
          <div className="scene-speech-text">{bubbleText}</div>
          {isFocused && (
            <div className="scene-speech-actions" onClick={(e) => e.stopPropagation()}>
              {FEEDBACK_ICONS.map((f) => (
                <button
                  key={f.type}
                  className={`btn-icon ${lastMessage.feedback === f.type ? 'active' : ''}`}
                  title={f.type}
                  onClick={() => onFeedback(lastMessage, f.type)}
                >
                  {f.icon}
                </button>
              ))}
              <button className="btn-icon" title="Reply" onClick={() => onReply(lastMessage)}>
                ↩️
              </button>
              {lastMessage.agentId !== 'user' &&
                AGENT_REACTIONS.map((r) => (
                  <button key={r.type} className="btn-icon" title={r.tooltip} onClick={() => onReaction(lastMessage, r.type)}>
                    {r.icon}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      <div
        className="scene-avatar-body"
        style={{
          background: `${agent.color}33`,
          borderColor: agent.color,
          borderRadius: `${bodyRadius}px ${bodyRadius}px 6px 6px`,
        }}
      />
      <div
        className="scene-avatar-circle"
        style={{
          background: agent.color,
          boxShadow: isSpeaking ? `0 0 0 4px ${agent.color}55, 0 0 24px ${agent.color}aa` : 'none',
          animationDuration: isSpeaking ? `${pulseSpeed}s` : undefined,
        }}
      >
        {agent.name.charAt(0).toUpperCase()}
      </div>
      <div className="scene-avatar-nametag" style={{ borderColor: agent.color }}>
        {agent.refNumber} {agent.name}
      </div>
      {isSpeaking && (
        <div className="scene-talking-indicator">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
}
