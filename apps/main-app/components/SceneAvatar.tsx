'use client';

import { Agent, Feedback, Message, ReactionType } from '@/lib/types';
import type { TraitDef } from '@/lib/traits';
import type { SceneSeat } from '@/lib/scenes';
import { useTypewriter } from '@/lib/use-typewriter';
import { AGENT_REACTIONS } from '@/lib/reactions';
import { SceneMarkdown } from './SceneMarkdown';

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

/** Soft light tint of the agent's color for a bubble background that still guarantees dark, legible text. */
function softTint(hex: string, alphaHex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alphaHex}` : `#3b99fc${alphaHex}`;
}

interface SceneAvatarProps {
  agent: Agent;
  seat: SceneSeat;
  traitDefs: TraitDef[];
  isSpeaking: boolean;
  isFocused: boolean;
  isDimmed: boolean;
  /** Degrees toward whichever agent is currently speaking (0 = looking straight ahead), for idle gaze tracking. */
  gazeAngleDeg: number;
  displayMessage?: Message;
  liveTyping: boolean;
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
  isDimmed,
  gazeAngleDeg,
  displayMessage,
  liveTyping,
  onFocus,
  onFeedback,
  onReaction,
  onReply,
}: SceneAvatarProps) {
  const formality = traitValue(agent, traitDefs, /formal/i);
  const energy = traitValue(agent, traitDefs, /aggress|energ|assert/i);
  const bodyRadius = 24 - Math.round((formality / 100) * 18);
  const pulseSpeed = 1.4 - (energy / 100) * 0.7;
  const typed = useTypewriter(liveTyping ? displayMessage?.content ?? '' : '');
  const bubbleText = liveTyping ? typed : displayMessage?.content ?? '';
  const eyeOffsetX = Math.cos((gazeAngleDeg * Math.PI) / 180) * 3;
  const eyeOffsetY = Math.sin((gazeAngleDeg * Math.PI) / 180) * 3;
  const leanDeg = Math.max(-6, Math.min(6, gazeAngleDeg / 30));

  return (
    <div
      className={`scene-avatar-slot ${isFocused ? 'focused' : ''} ${isSpeaking ? 'speaking' : ''} ${
        isDimmed ? 'dimmed' : ''
      }`}
      style={{ left: `${seat.xPct}%`, top: `${seat.yPct}%`, transform: `translate(-50%, -50%) scale(${seat.scale})` }}
      onClick={onFocus}
    >
      {isFocused && <div className="scene-spotlight" />}
      {displayMessage && (
        <div className={`scene-speech-bubble ${isFocused ? 'expanded' : ''}`} style={{ background: softTint(agent.color, '22') }}>
          <div className="scene-speech-tail" style={{ borderTopColor: softTint(agent.color, '22') }} />
          <div className="scene-speech-text">
            <SceneMarkdown content={bubbleText} />
          </div>
          {isFocused && (
            <div className="scene-speech-actions" onClick={(e) => e.stopPropagation()}>
              {FEEDBACK_ICONS.map((f) => (
                <button
                  key={f.type}
                  className={`btn-icon ${displayMessage.feedback === f.type ? 'active' : ''}`}
                  title={f.type}
                  onClick={() => onFeedback(displayMessage, f.type)}
                >
                  {f.icon}
                </button>
              ))}
              <button className="btn-icon" title="Reply" onClick={() => onReply(displayMessage)}>
                ↩️
              </button>
              {displayMessage.agentId !== 'user' &&
                AGENT_REACTIONS.map((r) => (
                  <button key={r.type} className="btn-icon" title={r.tooltip} onClick={() => onReaction(displayMessage, r.type)}>
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
          transform: `rotate(${leanDeg}deg)`,
        }}
      />
      <div className="scene-avatar-seat-shadow" />
      <div
        className="scene-avatar-circle"
        style={{
          background: agent.color,
          boxShadow: isSpeaking ? `0 0 0 4px ${agent.color}55, 0 0 24px ${agent.color}aa` : 'none',
          animationDuration: isSpeaking ? `${pulseSpeed}s` : undefined,
        }}
      >
        {agent.name.charAt(0).toUpperCase()}
        <div className="scene-avatar-eyes">
          <span style={{ transform: `translate(${eyeOffsetX}px, ${eyeOffsetY}px)` }} />
          <span style={{ transform: `translate(${eyeOffsetX}px, ${eyeOffsetY}px)` }} />
        </div>
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
