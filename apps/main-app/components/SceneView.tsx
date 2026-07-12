'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Agent, Feedback, Message, ReactionType } from '@/lib/types';
import { TraitDef } from '@/lib/traits';
import { SCENES, getScene } from '@/lib/scenes';
import { SceneAvatar } from './SceneAvatar';
import { devRef } from '@/lib/devref';

interface SceneViewProps {
  agents: Agent[];
  traitDefs: TraitDef[];
  messages: Message[];
  thinking: Map<string, string>;
  sceneId: string;
  onChangeScene: (id: string) => void;
  onFeedback: (message: Message, type: Feedback) => void;
  onReaction: (message: Message, type: ReactionType) => void;
  onReply: (message: Message) => void;
  onClose: () => void;
}

export function SceneView({
  agents,
  traitDefs,
  messages,
  thinking,
  sceneId,
  onChangeScene,
  onFeedback,
  onReaction,
  onReply,
  onClose,
}: SceneViewProps) {
  const activeAgents = useMemo(() => agents.filter((a) => a.active), [agents]);
  const scene = getScene(sceneId);
  const seats = useMemo(() => scene.layout(activeAgents.length), [scene, activeAgents.length]);

  const [manualFocusId, setManualFocusId] = useState<string | null>(null);
  const [userDismissed, setUserDismissed] = useState(false);
  const prevThinkingCount = useRef(0);

  const thinkingIds = useMemo(
    () => Array.from(thinking.keys()).filter((id) => activeAgents.some((a) => a.id === id)),
    [thinking, activeAgents]
  );

  useEffect(() => {
    // A fresh single speaker starting their turn always reclaims focus, even
    // after the user dismissed to a wide shot.
    if (thinkingIds.length > 0 && prevThinkingCount.current === 0) {
      setUserDismissed(false);
    }
    prevThinkingCount.current = thinkingIds.length;
  }, [thinkingIds.length]);

  const lastMessageByAgent = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) {
      if (m.agentId !== 'user') map.set(m.agentId, m);
    }
    return map;
  }, [messages]);

  const autoFocusId = !userDismissed && thinkingIds.length === 1 ? thinkingIds[0] : null;
  const focusId = manualFocusId ?? autoFocusId;
  const focusIndex = focusId ? activeAgents.findIndex((a) => a.id === focusId) : -1;
  const focusSeat = focusIndex >= 0 ? seats[focusIndex] : null;
  const zoom = focusSeat ? 2.1 : 1;
  const focusX = focusSeat?.xPct ?? 50;
  const focusY = focusSeat?.yPct ?? 50;

  function dismissToWideShot() {
    setManualFocusId(null);
    setUserDismissed(true);
  }

  return (
    <div className="scene-view" {...devRef('s22')}>
      <div className="scene-toolbar">
        <select
          {...devRef('dr20')}
          value={sceneId}
          onChange={(e) => onChangeScene(e.target.value)}
          title="Choose the scenery"
        >
          {SCENES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon} {s.label}
            </option>
          ))}
        </select>
        <button className="control-btn" {...devRef('b51')} onClick={dismissToWideShot} title="Zoom out to the full scene">
          🔭 Wide Shot
        </button>
        <button className="control-btn" {...devRef('b52')} onClick={onClose} title="Back to text thread">
          📜 Thread View
        </button>
      </div>
      <div className="scene-stage" style={{ background: scene.background }} onClick={dismissToWideShot}>
        <div
          className="scene-world"
          style={{
            // @ts-expect-error -- CSS custom properties aren't in React's CSSProperties type.
            '--focus-x': `${focusX}%`,
            '--focus-y': `${focusY}%`,
            '--zoom': zoom,
          }}
        >
          {activeAgents.map((agent, i) => (
            <SceneAvatar
              key={agent.id}
              agent={agent}
              seat={seats[i]}
              traitDefs={traitDefs}
              isSpeaking={thinkingIds.includes(agent.id)}
              isFocused={focusId === agent.id}
              lastMessage={lastMessageByAgent.get(agent.id)}
              onFocus={() => setManualFocusId((prev) => (prev === agent.id ? null : agent.id))}
              onFeedback={onFeedback}
              onReaction={onReaction}
              onReply={onReply}
            />
          ))}
          {activeAgents.length === 0 && (
            <div className="empty-state" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
              No active agents to seat in this scene.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
