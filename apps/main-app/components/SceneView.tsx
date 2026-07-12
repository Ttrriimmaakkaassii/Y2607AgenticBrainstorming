'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Agent, Feedback, Message, ReactionType } from '@/lib/types';
import { TraitDef } from '@/lib/traits';
import { SCENE_BACKGROUND, sideLayout, type SceneSeat } from '@/lib/scenes';
import { PLAYBACK_SPEEDS, type PlaybackSpeed, buildSceneTimeline, messageDurationMs } from '@/lib/scene-timeline';
import { SceneAvatar } from './SceneAvatar';
import { SceneMarkdown } from './SceneMarkdown';
import { useTypewriter } from '@/lib/use-typewriter';
import { AGENT_REACTIONS, UNIVERSAL_REACTIONS } from '@/lib/reactions';
import { devRef } from '@/lib/devref';

const DELAY_OPTIONS = [
  { label: '1s', value: 1000 },
  { label: '2.5s', value: 2500 },
  { label: '5s', value: 5000 },
  { label: '8s', value: 8000 },
];

type BubbleSize = 'xs' | 'sm' | 'md' | 'lg';
const BUBBLE_SIZE_OPTIONS: { value: BubbleSize; label: string }[] = [
  { value: 'xs', label: '💬 Extra Small' },
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Finds another seated agent the speaker's message is addressing — either
 * by "@Agt3"-style reference or by mentioning that agent's name outright —
 * so the stage can draw a directional arrow at them. */
function findAddressedAgent(content: string, speakerId: string, agents: Agent[]): Agent | null {
  for (const a of agents) {
    if (a.id === speakerId) continue;
    const refPattern = new RegExp(`@?\\b${escapeRegExp(a.refNumber)}\\b`, 'i');
    const namePattern = a.name.trim().length > 1 ? new RegExp(`\\b${escapeRegExp(a.name.trim())}\\b`, 'i') : null;
    if (refPattern.test(content) || namePattern?.test(content)) return a;
  }
  return null;
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
  onToggleStarred: (message: Message) => void;
  onSetCategory: (message: Message) => void;
  onShareWhatsApp: (message: Message) => void;
  /** Which message/word the app's configured TTS reader is currently on (or null), so replay can sync its cursor and highlight to it. */
  spokenRange: { messageId: string; charIndex: number; charLength: number } | null;
  /** Starts the configured TTS reader (Browser/Google/Txt2Audio, whichever is set in Audio settings) from this message onward. */
  onPlayFromMessageId: (id: string) => void;
  onStopSpeaking: () => void;
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
  onToggleStarred,
  onSetCategory,
  onShareWhatsApp,
  spokenRange,
  onPlayFromMessageId,
  onStopSpeaking,
  onClose,
}: SceneViewProps) {
  const speakingMessageId = spokenRange?.messageId ?? null;
  const activeAgents = useMemo(() => agents.filter((a) => a.active), [agents]);
  const seats = useMemo(() => sideLayout(activeAgents.length), [activeAgents.length]);

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

  const [bubbleSize, setBubbleSize] = useState<BubbleSize>('sm');
  const [playbackMode, setPlaybackMode] = useState<'live' | 'replay'>('live');
  const [cursorIndex, setCursorIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;
  const audioStartedRef = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ChatApp recreates onStopSpeaking on every render (it's not memoized), so
  // this is read through a ref rather than depended on directly — depending
  // on it would re-run this effect's cleanup on every unrelated re-render
  // (e.g. every time `speaking` updates while audio is actually playing),
  // which canceled narration the instant it started.
  const onStopSpeakingRef = useRef(onStopSpeaking);
  onStopSpeakingRef.current = onStopSpeaking;

  // Stop any narration this view kicked off if it's closed/unmounted mid-replay.
  useEffect(
    () => () => {
      if (audioEnabledRef.current) onStopSpeakingRef.current();
    },
    []
  );

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

  // Auto-advance the replay cursor while playing — a fixed-timer estimate,
  // used only when audio narration is off. With narration on, the cursor
  // instead follows the reader (see the effect below) so the scene stays in
  // sync with actual speech instead of a length-based guess.
  useEffect(() => {
    if (playbackMode !== 'replay' || !isPlaying || audioEnabled) return;
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
  }, [playbackMode, isPlaying, cursorIndex, playbackSpeed, timeline, audioEnabled]);

  // Kick off the configured TTS reader at the current cursor when audio
  // narration is on and replay starts playing. Deliberately excludes
  // cursorIndex/timeline from its deps — it should fire once per Play press,
  // not every time the cursor advances (the effect below tracks that).
  useEffect(() => {
    if (!audioEnabled || playbackMode !== 'replay' || !isPlaying) return;
    audioStartedRef.current = false;
    const current = timeline[cursorIndex];
    if (current) onPlayFromMessageId(current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, playbackMode, audioEnabled]);

  // Follow the reader: move the cursor to whichever message it's currently
  // speaking, and stop playback once it naturally runs out of messages.
  useEffect(() => {
    if (!audioEnabled || playbackMode !== 'replay' || !isPlaying) return;
    if (speakingMessageId) {
      audioStartedRef.current = true;
      const idx = timeline.findIndex((m) => m.id === speakingMessageId);
      if (idx >= 0 && idx !== cursorIndex) setCursorIndex(idx);
    } else if (audioStartedRef.current) {
      setIsPlaying(false);
    }
  }, [speakingMessageId, audioEnabled, playbackMode, isPlaying, timeline, cursorIndex]);

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
    if (isPlaying && audioEnabled) onStopSpeaking();
    setIsPlaying((v) => !v);
  }

  function scrubTo(index: number) {
    if (audioEnabled) onStopSpeaking();
    setPlaybackMode('replay');
    setIsPlaying(false);
    setCursorIndex(index);
  }

  function goLive() {
    if (audioEnabled) onStopSpeaking();
    setPlaybackMode('live');
    setIsPlaying(false);
  }

  function toggleAudio() {
    setAudioEnabled((v) => {
      const next = !v;
      if (!next) onStopSpeaking();
      return next;
    });
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

  const addressedAgent = useMemo(() => {
    if (!focusAgent || !centralMessage) return null;
    return findAddressedAgent(centralMessage.content, focusAgent.id, activeAgents);
  }, [focusAgent, centralMessage, activeAgents]);
  const addressedSeat = addressedAgent ? seatByAgentId.get(addressedAgent.id) ?? null : null;

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

        {addressedSeat && (
          <svg className="scene-address-arrow" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <marker id="scene-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill={focusAgent!.color} />
              </marker>
            </defs>
            <line
              key={`${focusAgent!.id}-${addressedAgent!.id}`}
              className="scene-address-line"
              x1={50}
              y1={50}
              x2={addressedSeat.xPct}
              y2={addressedSeat.yPct}
              stroke={focusAgent!.color}
              markerEnd="url(#scene-arrowhead)"
            />
          </svg>
        )}

        {focusAgent && centralMessage && (
          <div className="scene-central-anchor">
            <CentralBubble
              key={centralMessage.id}
              agent={focusAgent}
              message={centralMessage}
              typing
              spokenRange={spokenRange && spokenRange.messageId === centralMessage.id ? spokenRange : null}
              onFeedback={onFeedback}
              onReaction={onReaction}
              onReply={onReply}
              onToggleStarred={onToggleStarred}
              onSetCategory={onSetCategory}
              onShareWhatsApp={onShareWhatsApp}
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
        <button
          className={`btn-icon ${audioEnabled ? 'active' : ''}`}
          {...devRef('b59')}
          title={audioEnabled ? 'Audio narration on (uses your Audio settings reader)' : 'Read replay aloud with your configured TTS reader'}
          onClick={toggleAudio}
        >
          {audioEnabled ? '🔊' : '🔇'}
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
  /** When the reader is actively speaking THIS message, the word currently being read — drives live word-sync highlighting instead of the typewriter approximation. */
  spokenRange: { charIndex: number; charLength: number } | null;
  onFeedback: (message: Message, type: Feedback) => void;
  onReaction: (message: Message, type: ReactionType) => void;
  onReply: (message: Message) => void;
  onToggleStarred: (message: Message) => void;
  onSetCategory: (message: Message) => void;
  onShareWhatsApp: (message: Message) => void;
}

function renderSpokenHighlight(text: string, range: { charIndex: number; charLength: number }) {
  if (range.charIndex < 0 || range.charIndex >= text.length) return text;
  const before = text.slice(0, range.charIndex);
  const word = text.slice(range.charIndex, range.charIndex + range.charLength);
  const after = text.slice(range.charIndex + range.charLength);
  return (
    <>
      {before}
      <span className="spoken-word">{word}</span>
      {after}
    </>
  );
}

/** The one shared speech bubble, always centered on the stage and linked to
 * whoever's currently speaking via the header + the speaker's own avatar
 * drifting toward it. Used for both live conversation and replay. */
function CentralBubble({
  agent,
  message,
  typing,
  spokenRange,
  onFeedback,
  onReaction,
  onReply,
  onToggleStarred,
  onSetCategory,
  onShareWhatsApp,
}: CentralBubbleProps) {
  // While the reader is actively on this message, the real spoken-word
  // position drives what's shown/highlighted, so the bubble text stays in
  // lockstep with the audio — the typewriter's own timer-based reveal only
  // applies when nothing's actually being read aloud.
  const typed = useTypewriter(typing && !spokenRange ? message.content : '');
  const text = spokenRange ? message.content : typing ? typed : message.content;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [text]);

  useEffect(() => {
    if (!spokenRange || !scrollRef.current) return;
    const marked = scrollRef.current.querySelector('.spoken-word');
    marked?.scrollIntoView({ block: 'nearest' });
  }, [spokenRange?.charIndex]);

  return (
    <div className="scene-central-box" style={{ borderTopColor: agent.color }} onClick={(e) => e.stopPropagation()}>
      <div className="scene-central-speaker">
        <span className="scene-central-dot" style={{ background: agent.color }} />
        {agent.refNumber} {agent.name} is speaking
      </div>
      <div className="scene-central-text" ref={scrollRef}>
        {spokenRange ? (
          <p className="scene-paragraph">{renderSpokenHighlight(text, spokenRange)}</p>
        ) : (
          <SceneMarkdown content={text} />
        )}
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
        {UNIVERSAL_REACTIONS.map((r) => (
          <button key={r.type} className="btn-icon" title={r.tooltip} onClick={() => onReaction(message, r.type)}>
            {r.icon}
          </button>
        ))}
        <button
          className={`btn-icon ${message.starred ? 'active' : ''}`}
          title="Star for filtering"
          onClick={() => onToggleStarred(message)}
        >
          {message.starred ? '⭐' : '☆'}
        </button>
        <button className="btn-icon" title="Tag with a category" onClick={() => onSetCategory(message)}>
          🏷️
        </button>
        <button className="btn-icon" title="Share to WhatsApp" onClick={() => onShareWhatsApp(message)}>
          💬📱
        </button>
      </div>
    </div>
  );
}
