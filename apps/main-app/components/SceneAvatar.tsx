'use client';

import { Agent } from '@/lib/types';
import type { TraitDef } from '@/lib/traits';
import { SPEAKING_COLOR, ADDRESSED_COLOR, type SceneSeat } from '@/lib/scenes';
import { shadeColor } from '@/lib/color';

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
  /** This agent is who the current speaker's message is addressing. */
  isAddressed: boolean;
  isFocused: boolean;
  isDimmed: boolean;
  isDragging: boolean;
  /** Degrees toward whichever agent is currently speaking (0 = looking straight ahead), for idle gaze tracking. */
  gazeAngleDeg: number;
  onPointerDown: (e: React.PointerEvent) => void;
}

/** A single seated participant — a Messenger-style round contact avatar in
 * the agent's own preset color, not a boxy body. All message text lives in
 * the shared central bubble in SceneView, not here. */
export function SceneAvatar({
  agent,
  seat,
  traitDefs,
  isSpeaking,
  isAddressed,
  isFocused,
  isDimmed,
  isDragging,
  gazeAngleDeg,
  onPointerDown,
}: SceneAvatarProps) {
  const energy = traitValue(agent, traitDefs, /aggress|energ|assert/i);
  const pulseSpeed = 1.4 - (energy / 100) * 0.7;
  const eyeOffsetX = Math.cos((gazeAngleDeg * Math.PI) / 180) * 3;
  const eyeOffsetY = Math.sin((gazeAngleDeg * Math.PI) / 180) * 3;
  // Speaking (green) takes priority over being addressed (red), which takes
  // priority over the agent's own preset color — so the two roles read at a
  // glance regardless of what color an agent was assigned.
  const displayColor = isSpeaking ? SPEAKING_COLOR : isAddressed ? ADDRESSED_COLOR : agent.color;

  return (
    <div
      className={`scene-avatar-slot ${isFocused ? 'focused' : ''} ${isSpeaking ? 'speaking' : ''} ${
        isAddressed ? 'addressed' : ''
      } ${isDimmed ? 'dimmed' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        left: `${seat.xPct}%`,
        top: `${seat.yPct}%`,
        transform: `translate(-50%, -50%) scale(${seat.scale * (isFocused ? 1.12 : 1)})`,
      }}
      onPointerDown={onPointerDown}
    >
      {isFocused && <div className="scene-spotlight" />}
      <div className="scene-avatar-seat-shadow" />
      <div
        className="scene-avatar-circle"
        style={{
          background: `radial-gradient(circle at 32% 26%, ${shadeColor(displayColor, 24)} 0%, ${displayColor} 60%)`,
          boxShadow:
            isSpeaking || isAddressed
              ? `0 0 0 4px ${displayColor}55, 0 0 24px ${displayColor}aa`
              : 'none',
          animationDuration: isSpeaking ? `${pulseSpeed}s` : undefined,
        }}
      >
        {agent.name.charAt(0).toUpperCase()}
        <div className="scene-avatar-eyes">
          <span style={{ transform: `translate(${eyeOffsetX}px, ${eyeOffsetY}px)` }} />
          <span style={{ transform: `translate(${eyeOffsetX}px, ${eyeOffsetY}px)` }} />
        </div>
      </div>
      <div className="scene-avatar-refbadge" style={{ borderColor: displayColor }}>
        {agent.refNumber}
      </div>
      <div className="scene-avatar-nametag" style={{ borderColor: displayColor }}>
        <span className="scene-avatar-nametag-ref">{agent.refNumber}</span>
        {agent.name.split(/\s+/).filter(Boolean).map((word, i) => (
          <span key={i}>{word}</span>
        ))}
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
