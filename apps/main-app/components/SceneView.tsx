'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Agent, Feedback, Message, ReactionType } from '@/lib/types';
import { TraitDef } from '@/lib/traits';
import { SCENES, getScene, type SceneSeat } from '@/lib/scenes';
import { PLAYBACK_SPEEDS, type PlaybackSpeed, buildSceneTimeline, messageDurationMs } from '@/lib/scene-timeline';
import { SceneAvatar } from './SceneAvatar';
import { SceneMarkdown } from './SceneMarkdown';
import { useTypewriter } from '@/lib/use-typewriter';
import { AGENT_REACTIONS } from '@/lib/reactions';
import { devRef } from '@/lib/devref';

const DELAY_OPTIONS = [
  { label: '1s', value: 1000 },
  { label: '2.5s', value: 2500 },
  { label: '5s', value: 5000 },
  { label: '8s', value: 8000 },
];

type TextSize = 'sm' | 'md' | 'lg';
const TEXT_SIZE_OPTIONS: { value: TextSize; label: string }[] = [
  { value: 'sm', label: 'A Small' },
  { value: 'md', label: 'A Medium' },
  { value: 'lg', label: 'A Large' },
];

const FEEDBACK_ICONS: { type: Feedback; icon: string }[] = [
  { type: 'like', icon: '👍' },
  { type: 'dislike', icon: '👎' },
  { type: 'clarify', icon: '🤔' },
];

function angleBetween(from: SceneSeat, to: SceneSeat): number {
  return (Math.atan2(to.yPct - from.yPct, to.xPct - from.xPct) * 180) / Math.PI;
}

/** Percent-space drag bounds so an avatar can never be dragged fully off the stage. */
function clampPct(v: number): number {
  return Math.max(6, Math.min(94, v));
}

interface SceneViewProps {
  agents: Agent[];
  traitDefs: TraitDef[];
  messages: Message[];
  thinking: Map<string, string>;
  sceneId: string;
  onChangeScene: (id: string) => void;
  postSpeechDelayMs: number;
  onChangePostSpeechDelay: (ms: number) => void;
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
  postSpeechDelayMs,
  onChangePostSpeechDelay,
  onFeedback,
  onReaction,
  onReply,
  onClose,
}: SceneViewProps) {
  const activeAgents = useMemo(() => agents.filter((a) => a.active), [agents]);
  const scene = getScene(sceneId);
  const seats = useMemo(() => scene.layout(activeAgents.length), [scene, activeAgents.length]);

  const stageRef = useRef<HTMLDivElement>(null);
  // User-dragged overrides, kept per scenery so switching scenes doesn't
  // carry a Round Table layout into the Boardroom. Component-local state,
  // as requested — not persisted across reloads.
  const [customSeats, setCustomSeats] = useState<Record<string, Record<string, { xPct: number; yPct: number }>>>({});
  const dragState = useRef<{ agentId: string; startX: number; startY: number; moved: boolean } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const seatByAgentId = useMemo(() => {
    const map = new Map<string, SceneSeat>();
    activeAgents.forEach((a, i) => {
      const base = seats[i];
      const override = customSeats[sceneId]?.[a.id];
      map.set(a.id, override ? { ...base, xPct: override.xPct, yPct: override.yPct } : base);
    });
    return map;
  }, [activeAgents, seats, customSeats, sceneId]);

  const timeline = useMemo(() => buildSceneTimeline(messages), [messages]);

  const [manualFocusId, setManualFocusId] = useState<string | null>(null);
  const [userDismissed, setUserDismissed] = useState(false);
  const prevThinkingCount = useRef(0);

  const [textSize, setTextSize] = useState<TextSize>('md');
  const [playbackMode, setPlaybackMode] = useState<'live' | 'replay'>('live');
  const [cursorIndex, setCursorIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const thinkingIds = useMemo(
    () => Array.from(thinking.keys()).filter((id) => activeAgents.some((a) => a.id === id)),
    [thinking, activeAgents]
  );

  useEffect(() => {
    if (thinkingIds.length > 0 && prevThinkingCount.current === 0) {
      setUserDismissed(false);
    }
    prevThinkingCount.current = thinkingIds.length;
  }, [thinkingIds.length]);

  // Auto-advance the replay cursor while playing.
  useEffect(() => {
    if (playbackMode !== 'replay' || !isPlaying) return;
    const current = timeline[cursorIndex];
    if (!current) {
      setIsPlaying(false);
      return;
    }
    const delay = messageDurationMs(current.content) / playbackSpeed;
    advanceTimer.current = setTimeout(() => {
      setCursorIndex((prev) => {
        if (prev + 1 >= timeline.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, delay);
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [playbackMode, isPlaying, cursorIndex, playbackSpeed, timeline]);

  function startReplay() {
    setPlaybackMode('replay');
    setCursorIndex((idx) => (idx >= timeline.length ? 0 : idx));
    setIsPlaying(true);
  }

  function togglePlayPause() {
    if (playbackMode !== 'replay') {
      startReplay();
      return;
    }
    setIsPlaying((v) => !v);
  }

  function scrubTo(index: number) {
    setPlaybackMode('replay');
    setIsPlaying(false);
    setCursorIndex(index);
  }

  function goLive() {
    setPlaybackMode('live');
    setIsPlaying(false);
  }

  // --- Free-form dragging -------------------------------------------------

  function handleAvatarPointerDown(agentId: string, e: React.PointerEvent) {
    e.stopPropagation();
    dragState.current = { agentId, startX: e.clientX, startY: e.clientY, moved: false };
    setDraggingId(agentId);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function handlePointerMove(e: PointerEvent) {
    const drag = dragState.current;
    const rect = stageRef.current;
    if (!drag || !rect) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const box = rect.getBoundingClientRect();
    const xPct = clampPct(((e.clientX - box.left) / box.width) * 100);
    const yPct = clampPct(((e.clientY - box.top) / box.height) * 100);
    setCustomSeats((prev) => ({
      ...prev,
      [sceneId]: { ...prev[sceneId], [drag.agentId]: { xPct, yPct } },
    }));
  }

  function handlePointerUp() {
    const drag = dragState.current;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    setDraggingId(null);
    if (drag && !drag.moved) {
      // A click, not a drag — toggle camera focus like before.
      setManualFocusId((prev) => (prev === drag.agentId ? null : drag.agentId));
    }
    dragState.current = null;
  }

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    },
    []
  );

  // --- Focus / camera -------------------------------------------------

  const lastMessageByAgentLive = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) {
      if (m.agentId !== 'user') map.set(m.agentId, m);
    }
    return map;
  }, [messages]);

  const lastMessageByAgentReplay = useMemo(() => {
    const map = new Map<string, Message>();
    for (let i = 0; i <= cursorIndex && i < timeline.length; i++) {
      map.set(timeline[i].agentId, timeline[i]);
    }
    return map;
  }, [timeline, cursorIndex]);

  const replaying = playbackMode === 'replay';
  const displayMessages = replaying ? lastMessageByAgentReplay : lastMessageByAgentLive;
  const replayFocusAgentId = replaying ? timeline[cursorIndex]?.agentId ?? null : null;

  function dismissToWideShot() {
    setManualFocusId(null);
    setUserDismissed(true);
  }

  const autoFocusId = !userDismissed && thinkingIds.length === 1 ? thinkingIds[0] : null;
  const focusId = replaying ? replayFocusAgentId : manualFocusId ?? autoFocusId;
  const focusAgent = focusId ? activeAgents.find((a) => a.id === focusId) ?? null : null;
  const focusSeat = focusId ? seatByAgentId.get(focusId) ?? null : null;
  // Kept intentionally subtle: the "Always Visible" rule means the speaker
  // is highlighted via the spotlight/dim treatment on each avatar, not by
  // zooming far enough to crop other seats out of frame.
  const zoom = focusSeat ? 1.08 : 1;
  const focusX = focusSeat?.xPct ?? 50;
  const focusY = focusSeat?.yPct ?? 50;

  const theaterMessage = focusAgent ? displayMessages.get(focusAgent.id) : undefined;

  return (
    <div className={`scene-view scene-text-${textSize}`} {...devRef('s22')}>
      <div className="scene-toolbar">
        <select
          {...devRef('dr23')}
          value={textSize}
          onChange={(e) => setTextSize(e.target.value as TextSize)}
          title="Speech bubble text size"
        >
          {TEXT_SIZE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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
        {Object.keys(customSeats[sceneId] ?? {}).length > 0 && (
          <button
            className="control-btn"
            title="Reset dragged seats back to the scenery's default layout"
            onClick={() => setCustomSeats((prev) => ({ ...prev, [sceneId]: {} }))}
          >
            ↺ Reset Seats
          </button>
        )}
        <button className="control-btn" {...devRef('b52')} onClick={onClose} title="Back to text thread">
          📜 Thread View
        </button>
      </div>

      <div className="scene-stage" ref={stageRef} style={{ background: scene.background }} onClick={dismissToWideShot}>
        <div
          className="scene-world"
          style={{
            // @ts-expect-error -- CSS custom properties aren't in React's CSSProperties type.
            '--focus-x': `${focusX}%`,
            '--focus-y': `${focusY}%`,
            '--zoom': zoom,
          }}
        >
          {activeAgents.map((agent) => {
            const seat = seatByAgentId.get(agent.id)!;
            const gazeAngleDeg = focusSeat && focusId !== agent.id ? angleBetween(seat, focusSeat) : 0;
            return (
              <SceneAvatar
                key={agent.id}
                agent={agent}
                seat={seat}
                traitDefs={traitDefs}
                isSpeaking={!replaying && thinkingIds.includes(agent.id)}
                isFocused={focusId === agent.id}
                isDimmed={focusId != null && focusId !== agent.id}
                isDragging={draggingId === agent.id}
                theaterMode={replaying}
                gazeAngleDeg={gazeAngleDeg}
                displayMessage={displayMessages.get(agent.id)}
                liveTyping={replaying ? replayFocusAgentId === agent.id : !replaying}
                onPointerDown={(e) => handleAvatarPointerDown(agent.id, e)}
                onFeedback={onFeedback}
                onReaction={onReaction}
                onReply={onReply}
              />
            );
          })}
          {activeAgents.length === 0 && (
            <div className="empty-state" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
              No active agents to seat in this scene.
            </div>
          )}
        </div>

        {replaying && focusAgent && theaterMessage && focusSeat && (
          <div
            className={`scene-theater-anchor ${focusSeat.yPct < 38 ? 'below' : 'above'}`}
            style={{ left: `${focusSeat.xPct}%`, top: `${focusSeat.yPct}%` }}
          >
            <TheaterBox
              key={theaterMessage.id}
              agent={focusAgent}
              message={theaterMessage}
              typing={true}
              onFeedback={onFeedback}
              onReaction={onReaction}
              onReply={onReply}
            />
          </div>
        )}
      </div>

      <div className="scene-playback-bar" onClick={(e) => e.stopPropagation()}>
        <button className="btn-icon" {...devRef('b56')} title="Restart replay" onClick={() => scrubTo(0)} disabled={timeline.length === 0}>
          ⏮️
        </button>
        <button
          className="btn-icon"
          {...devRef('b57')}
          title={isPlaying ? 'Pause replay' : 'Play replay'}
          onClick={togglePlayPause}
          disabled={timeline.length === 0}
        >
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        <input
          type="range"
          className="scene-scrubber"
          {...devRef('i24')}
          min={0}
          max={Math.max(timeline.length - 1, 0)}
          value={Math.min(cursorIndex, Math.max(timeline.length - 1, 0))}
          onChange={(e) => scrubTo(Number(e.target.value))}
          disabled={timeline.length === 0}
        />
        <span className="scene-playback-label">
          {timeline.length === 0 ? '0 / 0' : `${Math.min(cursorIndex + 1, timeline.length)} / ${timeline.length}`}
        </span>
        <select
          {...devRef('dr21')}
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(Number(e.target.value) as PlaybackSpeed)}
          title="Playback speed"
        >
          {PLAYBACK_SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
        <select
          {...devRef('dr22')}
          value={postSpeechDelayMs}
          onChange={(e) => onChangePostSpeechDelay(Number(e.target.value))}
          title="Pause after each reply before the next agent's turn (Auto Mode)"
        >
          {DELAY_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              ⏱️ {d.label} pause
            </option>
          ))}
        </select>
        {replaying && (
          <button className="control-btn" {...devRef('b58')} onClick={goLive}>
            🔴 Live
          </button>
        )}
      </div>
    </div>
  );
}

interface TheaterBoxProps {
  agent: Agent;
  message: Message;
  typing: boolean;
  onFeedback: (message: Message, type: Feedback) => void;
  onReaction: (message: Message, type: ReactionType) => void;
  onReply: (message: Message) => void;
}

/** Theater Mode: a centered, teleprompter-style overlay for the active speaker's text during replay. */
function TheaterBox({ agent, message, typing, onFeedback, onReaction, onReply }: TheaterBoxProps) {
  const typed = useTypewriter(typing ? message.content : '');
  const text = typing ? typed : message.content;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [text]);

  return (
    <div className="scene-theater-box" style={{ borderTopColor: agent.color }} onClick={(e) => e.stopPropagation()}>
      <div className="scene-theater-tail" style={{ borderColor: agent.color }} />
      <div className="scene-theater-speaker">
        <span className="scene-theater-dot" style={{ background: agent.color }} />
        {agent.refNumber} {agent.name} is speaking
      </div>
      <div className="scene-theater-text" ref={scrollRef}>
        <SceneMarkdown content={text} />
      </div>
      <div className="scene-theater-actions">
        {FEEDBACK_ICONS.map((f) => (
          <button
            key={f.type}
            className={`btn-icon ${message.feedback === f.type ? 'active' : ''}`}
            title={f.type}
            onClick={() => onFeedback(message, f.type)}
          >
            {f.icon}
          </button>
        ))}
        <button className="btn-icon" title="Reply" onClick={() => onReply(message)}>
          ↩️
        </button>
        {AGENT_REACTIONS.map((r) => (
          <button key={r.type} className="btn-icon" title={r.tooltip} onClick={() => onReaction(message, r.type)}>
            {r.icon}
          </button>
        ))}
      </div>
    </div>
  );
}


