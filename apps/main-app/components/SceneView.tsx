'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Agent, Feedback, Message, ReactionType } from '@/lib/types';
import { TraitDef } from '@/lib/traits';
import { SCENE_BACKGROUND, circleLayout, type SceneSeat } from '@/lib/scenes';
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

type BubbleSize = 'sm' | 'md' | 'lg';
const BUBBLE_SIZE_OPTIONS: { value: BubbleSize; label: string }[] = [
  { value: 'sm', label: '💬 Small' },
  { value: 'md', label: '💬 Medium' },
  { value: 'lg', label: '💬 Large' },
];

const FEEDBACK_ICONS: { type: Feedback; icon: string }[] = [
  { type: 'like', icon: '👍' },
  { type: 'dislike', icon: '👎' },
  { type: 'clarify', icon: '🤔' },
];

/** How far a speaking avatar drifts toward the center bubble (0 = stays put, 1 = reaches dead center). */
const SPEAKER_CENTER_PULL = 0.32;

function angleBetween(from: SceneSeat, to: SceneSeat): number {
  return (Math.atan2(to.yPct - from.yPct, to.xPct - from.xPct) * 180) / Math.PI;
}

/** Percent-space drag bounds so an avatar can never be dragged fully off the stage. */
function clampPct(v: number): number {
  return Math.max(6, Math.min(94, v));
}

function moveTowardCenter(seat: SceneSeat, amount: number): SceneSeat {
  return { ...seat, xPct: seat.xPct + (50 - seat.xPct) * amount, yPct: seat.yPct + (50 - seat.yPct) * amount };
}

interface SceneViewProps {
  agents: Agent[];
  traitDefs: TraitDef[];
  messages: Message[];
  thinking: Map<string, string>;
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
  postSpeechDelayMs,
  onChangePostSpeechDelay,
  onFeedback,
  onReaction,
  onReply,
  onClose,
}: SceneViewProps) {
  const activeAgents = useMemo(() => agents.filter((a) => a.active), [agents]);
  const seats = useMemo(() => circleLayout(activeAgents.length), [activeAgents.length]);

  const stageRef = useRef<HTMLDivElement>(null);
  // User-dragged overrides — everyone starts on the default circle, but the
  // user can always rearrange the seating; kept component-local, not
  // persisted across reloads.
  const [customSeats, setCustomSeats] = useState<Record<string, { xPct: number; yPct: number }>>({});
  const dragState = useRef<{ agentId: string; startX: number; startY: number; moved: boolean } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const seatByAgentId = useMemo(() => {
    const map = new Map<string, SceneSeat>();
    activeAgents.forEach((a, i) => {
      const base = seats[i];
      const override = customSeats[a.id];
      map.set(a.id, override ? { ...base, xPct: override.xPct, yPct: override.yPct } : base);
    });
    return map;
  }, [activeAgents, seats, customSeats]);

  const timeline = useMemo(() => buildSceneTimeline(messages), [messages]);

  const [manualFocusId, setManualFocusId] = useState<string | null>(null);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [userDismissed, setUserDismissed] = useState(false);

  const [bubbleSize, setBubbleSize] = useState<BubbleSize>('md');
  const [playbackMode, setPlaybackMode] = useState<'live' | 'replay'>('live');
  const [cursorIndex, setCursorIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const thinkingIds = useMemo(
    () => Array.from(thinking.keys()).filter((id) => activeAgents.some((a) => a.id === id)),
    [thinking, activeAgents]
  );

  // Auto-focus follows whoever's currently composing a reply, and then
  // *stays* on them (rather than snapping back to a wide shot) through the
  // post-speech pause, so their message keeps showing in the center bubble
  // until the next agent picks up.
  useEffect(() => {
    if (thinkingIds.length === 1) {
      setAutoFocusId(thinkingIds[0]);
      setUserDismissed(false);
    }
  }, [thinkingIds]);

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
    setCustomSeats((prev) => ({ ...prev, [drag.agentId]: { xPct, yPct } }));
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

  const focusId = replaying ? replayFocusAgentId : userDismissed ? null : manualFocusId ?? autoFocusId;
  const focusAgent = focusId ? activeAgents.find((a) => a.id === focusId) ?? null : null;
  const focusSeat = focusId ? seatByAgentId.get(focusId) ?? null : null;
  const zoom = focusSeat ? 1.06 : 1;
  const focusX = focusSeat?.xPct ?? 50;
  const focusY = focusSeat?.yPct ?? 50;

  const centralMessage = focusAgent ? displayMessages.get(focusAgent.id) : undefined;
  const isLiveSpeaking = (agentId: string) => !replaying && thinkingIds.includes(agentId);

  return (
    <div className={`scene-view scene-bubble-${bubbleSize}`} {...devRef('s22')}>
      <div className="scene-toolbar">
        <select
          {...devRef('dr23')}
          value={bubbleSize}
          onChange={(e) => setBubbleSize(e.target.value as BubbleSize)}
          title="Speech bubble & text size"
        >
          {BUBBLE_SIZE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button className="control-btn" {...devRef('b51')} onClick={dismissToWideShot} title="Zoom out to the full scene">
          🔭 Wide Shot
        </button>
        {Object.keys(customSeats).length > 0 && (
          <button
            className="control-btn"
            title="Reset dragged seats back to the default circle"
            onClick={() => setCustomSeats({})}
          >
            ↺ Reset Seats
          </button>
        )}
        <button className="control-btn" {...devRef('b52')} onClick={onClose} title="Back to text thread">
          📜 Thread View
        </button>
      </div>

      <div className="scene-stage" ref={stageRef} style={{ background: SCENE_BACKGROUND }} onClick={dismissToWideShot}>
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
            const baseSeat = seatByAgentId.get(agent.id)!;
            const speakingNow = isLiveSpeaking(agent.id) || replayFocusAgentId === agent.id;
            const seat = speakingNow ? moveTowardCenter(baseSeat, SPEAKER_CENTER_PULL) : baseSeat;
            const gazeAngleDeg = focusSeat && focusId !== agent.id ? angleBetween(baseSeat, focusSeat) : 0;
            return (
              <SceneAvatar
                key={agent.id}
                agent={agent}
                seat={seat}
                traitDefs={traitDefs}
                isSpeaking={speakingNow}
                isFocused={focusId === agent.id}
                isDimmed={focusId != null && focusId !== agent.id}
                isDragging={draggingId === agent.id}
                gazeAngleDeg={gazeAngleDeg}
                onPointerDown={(e) => handleAvatarPointerDown(agent.id, e)}
              />
            );
          })}
          {activeAgents.length === 0 && (
            <div className="empty-state" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
              No active agents to seat in this scene.
            </div>
          )}
        </div>

        {focusAgent && centralMessage && (
          <div className="scene-central-anchor">
            <CentralBubble
              key={centralMessage.id}
              agent={focusAgent}
              message={centralMessage}
              typing
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

interface CentralBubbleProps {
  agent: Agent;
  message: Message;
  typing: boolean;
  onFeedback: (message: Message, type: Feedback) => void;
  onReaction: (message: Message, type: ReactionType) => void;
  onReply: (message: Message) => void;
}

/** The one shared speech bubble, always centered on the stage and linked to
 * whoever's currently speaking via the header + the speaker's own avatar
 * drifting toward it. Used for both live conversation and replay. */
function CentralBubble({ agent, message, typing, onFeedback, onReaction, onReply }: CentralBubbleProps) {
  const typed = useTypewriter(typing ? message.content : '');
  const text = typing ? typed : message.content;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [text]);

  return (
    <div className="scene-central-box" style={{ borderTopColor: agent.color }} onClick={(e) => e.stopPropagation()}>
      <div className="scene-central-speaker">
        <span className="scene-central-dot" style={{ background: agent.color }} />
        {agent.refNumber} {agent.name} is speaking
      </div>
      <div className="scene-central-text" ref={scrollRef}>
        <SceneMarkdown content={text} />
      </div>
      <div className="scene-central-actions">
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
