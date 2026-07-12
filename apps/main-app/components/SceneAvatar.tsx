'use client';

import { useEffect, useRef } from 'react';
import { Agent, Feedback, Message, ReactionType } from '@/lib/types';
import type { TraitDef } from '@/lib/traits';
import type { SceneSeat } from '@/lib/scenes';
import { useTypewriter } from '@/lib/use-typewriter';
import { AGENT_REACTIONS } from '@/lib/reactions';
import { shadeColor } from '@/lib/color';
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

interface SceneAvatarProps {
  agent: Agent;
  seat: SceneSeat;
  traitDefs: TraitDef[];
  isSpeaking: boolean;
  isFocused: boolean;
  isDimmed: boolean;
  isDragging: boolean;
  /** In Theater Mode (replay) the centered overlay owns the text — avatars stay bubble-free. */
  theaterMode: boolean;
  /** Degrees toward whichever agent is currently speaking (0 = looking straight ahead), for idle gaze tracking. */
  gazeAngleDeg: number;
  displayMessage?: Message;
  liveTyping: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
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
  isDragging,
  theaterMode,
  gazeAngleDeg,
  displayMessage,
  liveTyping,
  onPointerDown,
  onFeedback,
  onReaction,
  onReply,
}: SceneAvatarProps) {
  const formality = traitValue(agent, traitDefs, /formal/i);
  const energy = traitValue(agent, traitDefs, /aggress|energ|assert/i);
  const isFormal = formality >= 50;
  const outfitColor = shadeColor(agent.color, -22);
  const pulseSpeed = 1.4 - (energy / 100) * 0.7;
  const typed = useTypewriter(liveTyping ? displayMessage?.content ?? '' : '');
  const bubbleText = liveTyping ? typed : displayMessage?.content ?? '';
  const bubbleScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bubbleScrollRef.current) bubbleScrollRef.current.scrollTop = bubbleScrollRef.current.scrollHeight;
  }, [bubbleText]);
  const eyeOffsetX = Math.cos((gazeAngleDeg * Math.PI) / 180) * 3;
  const eyeOffsetY = Math.sin((gazeAngleDeg * Math.PI) / 180) * 3;
  const leanDeg = Math.max(-6, Math.min(6, gazeAngleDeg / 30));

  return (
    <div
      className={`scene-avatar-slot ${isFocused ? 'focused' : ''} ${isSpeaking ? 'speaking' : ''} ${
        isDimmed ? 'dimmed' : ''
      } ${isDragging ? 'dragging' : ''}`}
      style={{
        left: `${seat.xPct}%`,
        top: `${seat.yPct}%`,
        transform: `translate(-50%, -50%) scale(${seat.scale * (isFocused ? 1.12 : 1)})`,
      }}
      onPointerDown={onPointerDown}
    >
      {isFocused && <div className="scene-spotlight" />}
      {!theaterMode && displayMessage && (
        <div className={`scene-speech-bubble ${isFocused ? 'expanded' : ''}`}>
          <div className="scene-speech-tail" style={{ borderTopColor: agent.color }} />
          <div className="scene-speech-text" ref={bubbleScrollRef}>
            <SceneMarkdown content={bubbleText} />
          </div>
          {isFocused && (
            <div className="scene-speech-actions" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
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
      <svg
        className="scene-avatar-body"
        viewBox="0 0 60 46"
        style={{ transform: `rotate(${leanDeg}deg)` }}
      >
        <path
          d={
            isFormal
              ? 'M4,46 C4,20 15,3 30,3 C45,3 56,20 56,46 Z'
              : 'M2,46 C2,18 12,1 30,1 C48,1 58,18 58,46 Z'
          }
          fill={outfitColor}
        />
        {isFormal ? (
          <path d="M25,3 L30,16 L35,3 Z" fill={shadeColor(agent.color, 30)} opacity={0.85} />
        ) : (
          <path d="M22,4 Q30,12 38,4 L38,1 L22,1 Z" fill={shadeColor(agent.color, 30)} opacity={0.6} />
        )}
      </svg>
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
