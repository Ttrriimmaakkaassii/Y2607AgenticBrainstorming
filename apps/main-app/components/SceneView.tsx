'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Agent, Feedback, Message, ReactionType } from '@/lib/types';
import { TraitDef } from '@/lib/traits';
import { SCENE_BACKGROUND, sideLayout, SPEAKING_COLOR, ADDRESSED_COLOR, type SceneSeat } from '@/lib/scenes';
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

// Fixed spots flanking the central bubble — rather than drifting a speaker
// partway toward dead center (which pulled them behind/under the bubble
// box, hiding them entirely), the speaker and whoever they're addressing
// each get their own guaranteed-visible seat right beside it.
const SPEAKER_FLANK_SEAT: SceneSeat = { xPct: 86, yPct: 50, scale: 1.15 };
const ADDRESSEE_FLANK_SEAT: SceneSeat = { xPct: 14, yPct: 50, scale: 1.1 };

function angleBetween(from: SceneSeat, to: SceneSeat): number {
  return (Math.atan2(to.yPct - from.yPct, to.xPct - from.xPct) * 180) / Math.PI;
}

/** Percent-space drag bounds so an avatar can never be dragged fully off the stage. */
function clampPct(v: number): number {
  return Math.max(6, Math.min(94, v));
}

/** A straight line when both points are on the same side of the stage; a
 * bowed curve — arcing away from the central bubble at 50/50 — when they're
 * on opposite sides, so the arrow doesn't just cut straight through it. */
function buildArrowPath(x1: number, y1: number, x2: number, y2: number): string {
  const oppositeSides = (x1 - 50) * (x2 - 50) < 0;
  if (!oppositeSides) return `M ${x1},${y1} L ${x2},${y2}`;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const bow = Math.min(20, Math.max(10, Math.abs(x2 - x1) * 0.22));
  const cy = my <= 50 ? my - bow : my + bow;
  return `M ${x1},${y1} Q ${mx},${cy} ${x2},${y2}`;
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
  onPlayFromMessageId: (id: string, charOffset?: number) => void;
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
  // Some mobile browsers (notably Android Chrome) can silently drop a
  // queued speechSynthesis utterance with no onend/onerror/onstart event at
  // all, freezing `spokenRange` on whatever it last was — so relying purely
  // on it changing to notice a stall doesn't work. Continuous mode (on by
  // default) watches for that freeze and force-advances instead of leaving
  // replay stuck on the first message.
  const [continuousReplay, setContinuousReplay] = useState(true);
  const audioStartedRef = useRef(false);
  const lastSpokenChangeRef = useRef(Date.now());
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
  // until the next agent picks up. `thinking` is a single map shared across
  // ALL threads, so if two threads' auto-rounds ever overlap, more than one
  // agent can be thinking at once — requiring thinkingIds.length === 1
  // would then never fire again, freezing focus (and the speaker/addressee
  // display) on a stale agent. Detecting whichever agent newly started
  // thinking since the last render is robust to that regardless of how
  // many others are thinking concurrently elsewhere.
  const prevThinkingIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const prev = prevThinkingIdsRef.current;
    const newlyThinking = thinkingIds.filter((id) => !prev.includes(id));
    if (newlyThinking.length > 0) {
      setAutoFocusId(newlyThinking[newlyThinking.length - 1]);
      setUserDismissed(false);
    }
    prevThinkingIdsRef.current = thinkingIds;
  }, [thinkingIds]);

  // Seed the initial focus from whoever spoke last, so opening Scene View on
  // a conversation that's just sitting idle (nobody currently composing —
  // e.g. reopened later, or switched to from another tab) still shows the
  // most recent reply instead of a blank stage until someone starts typing.
  useEffect(() => {
    if (autoFocusId !== null) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.agentId !== 'user' && activeAgents.some((a) => a.id === m.agentId)) {
        setAutoFocusId(m.agentId);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    lastSpokenChangeRef.current = Date.now();
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
      lastSpokenChangeRef.current = Date.now();
      const idx = timeline.findIndex((m) => m.id === speakingMessageId);
      if (idx >= 0 && idx !== cursorIndex) setCursorIndex(idx);
    } else if (audioStartedRef.current && !continuousReplay) {
      setIsPlaying(false);
    }
  }, [speakingMessageId, audioEnabled, playbackMode, isPlaying, timeline, cursorIndex, continuousReplay]);

  // Watchdog: if the reader hasn't advanced (spokenRange frozen, or gone
  // silently null with nothing following it up) for noticeably longer than
  // this message should ever take to speak, force it onto the next message
  // instead of leaving replay stuck. Only active in Continuous mode.
  useEffect(() => {
    if (!audioEnabled || !continuousReplay || playbackMode !== 'replay' || !isPlaying) return;
    const watchdog = setInterval(() => {
      const current = timeline[cursorIndex];
      if (!current) return;
      const estimatedMs = Math.max(6000, (current.content.length / 12) * 1000 + 5000);
      if (Date.now() - lastSpokenChangeRef.current < estimatedMs) return;
      if (cursorIndex + 1 >= timeline.length) {
        setIsPlaying(false);
        return;
      }
      onStopSpeaking();
      const nextIdx = cursorIndex + 1;
      lastSpokenChangeRef.current = Date.now();
      audioStartedRef.current = false;
      setCursorIndex(nextIdx);
      onPlayFromMessageId(timeline[nextIdx].id);
    }, 1000);
    return () => clearInterval(watchdog);
  }, [audioEnabled, continuousReplay, playbackMode, isPlaying, timeline, cursorIndex, onStopSpeaking, onPlayFromMessageId]);

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

  /** One-click "listen to the conversation" — turns narration on (if it wasn't already) and starts/pauses replay together, instead of needing the mute toggle and play button separately. */
  function toggleAudioPlay() {
    if (!audioEnabled) setAudioEnabled(true);
    togglePlayPause();
  }

  /** Selecting/highlighting a word in the bubble text starts the reader from
   * there instead of the message's beginning. */
  function playFromSelection(messageId: string, charOffset: number) {
    if (!audioEnabled) setAudioEnabled(true);
    const idx = timeline.findIndex((m) => m.id === messageId);
    if (idx >= 0) {
      setPlaybackMode('replay');
      setCursorIndex(idx);
    }
    setIsPlaying(true);
    onPlayFromMessageId(messageId, charOffset);
  }

  /** `keepPlaying`: used by swipe (not the manual scrubber drag) — if audio
   * narration was actively playing, keep it playing on the new message
   * instead of stopping, since a swipe is "skip to the next/previous one",
   * not "pause and let me look". */
  function scrubTo(index: number, keepPlaying = false) {
    const resumeAudio = keepPlaying && audioEnabled && isPlaying;
    if (audioEnabled) onStopSpeaking();
    setPlaybackMode('replay');
    setCursorIndex(index);
    if (resumeAudio) {
      const nextId = timeline[index]?.id;
      if (nextId) onPlayFromMessageId(nextId);
    } else {
      setIsPlaying(false);
    }
  }

  /** Swipe-to-navigate on the central bubble — mobile-friendly alternative to dragging the scrubber. */
  function swipeToNext() {
    if (timeline.length === 0) return;
    const base = replaying ? cursorIndex : timeline.length - 1;
    scrubTo(Math.min(base + 1, timeline.length - 1), true);
  }

  function swipeToPrev() {
    if (timeline.length === 0) return;
    const base = replaying ? cursorIndex : timeline.length - 1;
    scrubTo(Math.max(base - 1, 0), true);
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
  // Replay is browsing HISTORY, which can include a message from an agent
  // that's since been deactivated — falling back to the full roster (not
  // just activeAgents) keeps the bubble showing that message instead of
  // going blank the moment playback lands on it (most commonly the very
  // first message in the timeline, right when Play is first pressed).
  const focusAgent = focusId ? activeAgents.find((a) => a.id === focusId) ?? agents.find((a) => a.id === focusId) ?? null : null;
  const focusSeat = focusId ? seatByAgentId.get(focusId) ?? null : null;
  // The camera always zooms on the bubble itself (50/50) rather than toward
  // whoever's focused — the speaker now sits at a fixed flanking seat beside
  // the bubble (see SPEAKER_FLANK_SEAT below), not drifting toward center,
  // so zooming off-center toward them would look lopsided.
  const zoom = focusSeat ? 1.04 : 1;
  const focusX = 50;
  const focusY = 50;

  const centralMessage = focusAgent ? displayMessages.get(focusAgent.id) : undefined;

  const addressedAgent = useMemo(() => {
    if (!focusAgent || !centralMessage) return null;
    return findAddressedAgent(centralMessage.content, focusAgent.id, activeAgents);
  }, [focusAgent, centralMessage, activeAgents]);
  // Tied to `focusId` (same thing driving the bubble) rather than the raw
  // `thinking` map — thinking only covers the brief network round-trip, so
  // keying drift/pulse off it alone snapped the avatar back the instant a
  // reply arrived, even while it was still typing out in the bubble.
  const focusSpeakingNow = focusId != null;
  // Both the speaker and whoever they're addressing get a fixed seat right
  // beside the bubble (see SPEAKER_FLANK_SEAT/ADDRESSEE_FLANK_SEAT) instead
  // of their normal stage position, so the arrow always runs between those
  // two fixed points rather than the agents' regular seats.
  const arrowOriginSeat = focusSpeakingNow ? SPEAKER_FLANK_SEAT : focusSeat;
  const addressedSeat = addressedAgent ? ADDRESSEE_FLANK_SEAT : null;

  return (
    <div className={`scene-view scene-bubble-${bubbleSize}`} {...devRef('s22')}>
      {/* Floats right next to the main conversation Play/Resume button
          (`.floating-play-btn`, rendered by ChatApp), rather than living
          among the replay transport controls, since it's a "play the whole
          thing, narrated" shortcut for the live/talking-agents experience. */}
      <button
        className={`scene-play-audio-floating ${audioEnabled ? 'active' : ''}`}
        {...devRef('b74')}
        title={
          isPlaying && audioEnabled
            ? 'Pause the read-aloud replay'
            : 'Play the conversation aloud (turns on narration and starts replay together)'
        }
        onClick={toggleAudioPlay}
        disabled={timeline.length === 0}
      >
        🔊{isPlaying && audioEnabled ? '⏸️' : '▶️'}
      </button>
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
        {focusAgent && (
          <div className="scene-flash-card">
            <span className="scene-flash-speaker" style={{ borderColor: SPEAKING_COLOR }}>
              🗣️ {focusAgent.refNumber} {focusAgent.name} Speaking
            </span>
            {addressedAgent && (
              <span className="scene-flash-addressed" style={{ borderColor: ADDRESSED_COLOR }}>
                → {addressedAgent.refNumber} {addressedAgent.name} Addressed
              </span>
            )}
          </div>
        )}
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
            const speakingNow = replaying ? replayFocusAgentId === agent.id : focusId === agent.id;
            const isAddressedNow = addressedAgent?.id === agent.id;
            // The speaker and whoever they're addressing jump to fixed seats
            // right beside the bubble — guaranteed visible — instead of their
            // regular stage position, which could drift behind/under the
            // (much larger) bubble box and effectively disappear there.
            const seat = speakingNow ? SPEAKER_FLANK_SEAT : isAddressedNow ? ADDRESSEE_FLANK_SEAT : baseSeat;
            const gazeAngleDeg = focusSeat && focusId !== agent.id ? angleBetween(baseSeat, focusSeat) : 0;
            return (
              <SceneAvatar
                key={agent.id}
                agent={agent}
                seat={seat}
                traitDefs={traitDefs}
                isSpeaking={speakingNow}
                isAddressed={addressedAgent?.id === agent.id}
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

          {/* Lives inside .scene-world (not as a stage-level sibling) so it
              rides the same zoom transform as the avatars — drawing it
              outside caused the endpoints to drift out of alignment with
              the actual avatar positions whenever the camera was zoomed in
              on a focused speaker. */}
          {addressedSeat && arrowOriginSeat && (
            <svg className="scene-address-arrow" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <marker id="scene-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill={SPEAKING_COLOR} />
                </marker>
              </defs>
              <path
                key={`${focusAgent!.id}-${addressedAgent!.id}`}
                className="scene-address-line"
                d={buildArrowPath(arrowOriginSeat.xPct, arrowOriginSeat.yPct, addressedSeat.xPct, addressedSeat.yPct)}
                fill="none"
                stroke={SPEAKING_COLOR}
                markerEnd="url(#scene-arrowhead)"
              />
            </svg>
          )}
        </div>

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
              onSwipeNext={swipeToNext}
              onSwipePrev={swipeToPrev}
              onSelectSeek={(offset) => playFromSelection(centralMessage.id, offset)}
            />
          </div>
        )}
      </div>

      <div className="scene-playback-bar" onClick={(e) => e.stopPropagation()}>
        <button
          className="scene-transport-btn"
          {...devRef('b56')}
          title="Restart replay"
          onClick={() => scrubTo(0)}
          disabled={timeline.length === 0}
        >
          ⏮️
        </button>
        <button
          className="scene-play-btn"
          {...devRef('b57')}
          title={isPlaying ? 'Pause replay' : 'Play replay'}
          onClick={togglePlayPause}
          disabled={timeline.length === 0}
        >
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        <button
          className={`scene-transport-btn scene-mute-btn ${audioEnabled ? 'active' : ''}`}
          {...devRef('b59')}
          title={audioEnabled ? 'Audio narration on — click to mute (uses your Audio settings reader)' : 'Muted — click to read replay aloud with your configured TTS reader'}
          onClick={toggleAudio}
        >
          {audioEnabled ? '🔊' : '🔇'}
        </button>
        <button
          className={`scene-transport-btn ${continuousReplay ? 'active' : ''}`}
          {...devRef('b60')}
          title={
            continuousReplay
              ? 'Continuous: on — replay recovers and keeps going even if the reader stalls (default)'
              : 'Continuous: off — replay stops if the reader stalls instead of forcing it onward'
          }
          onClick={() => setContinuousReplay((v) => !v)}
        >
          {continuousReplay ? '🔁' : '⏹️'}
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
          <button className="scene-live-btn" {...devRef('b58')} onClick={goLive}>
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
  /** Swipe left/right on the bubble steps to the next/previous message (mobile-friendly alternative to the scrubber). */
  onSwipeNext: () => void;
  onSwipePrev: () => void;
  /** Selecting/highlighting a word or phrase in the text starts the reader from that character offset. */
  onSelectSeek: (charOffset: number) => void;
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
  onSwipeNext,
  onSwipePrev,
  onSelectSeek,
}: CentralBubbleProps) {
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_FEEDBACK_RANGE = 100;
  // Live horizontal drag offset, purely for the nub feedback below — reset
  // once the gesture ends (committed or not). Positive = dragging right
  // (green, next message), negative = dragging left (red, previous message).
  const [dragDx, setDragDx] = useState(0);

  function handleSwipeStart(e: React.PointerEvent) {
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    // A real swipe naturally drags the pointer past the box's edge (right
    // where the nub sits) before it's released — without capture, that
    // crossing fires pointerleave (see handleSwipeCancel) and aborts the
    // gesture before pointerup ever arrives, so the swipe silently never
    // completes. Capturing keeps move/up routed to this element regardless
    // of where the pointer physically is.
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleSwipeMove(e: React.PointerEvent) {
    const start = swipeStartRef.current;
    if (!start) return;
    setDragDx(e.clientX - start.x);
  }

  function handleSwipeEnd(e: React.PointerEvent) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    setDragDx(0);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // Require a clearly horizontal, deliberate drag so scrolling the
    // (possibly overflowing) message text vertically never misfires as a swipe.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // Right (green nub) -> next message; left (red nub) -> previous.
    if (dx > 0) onSwipeNext();
    else onSwipePrev();
  }

  function handleSwipeCancel(e: React.PointerEvent) {
    swipeStartRef.current = null;
    setDragDx(0);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }
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

  const rightNubOpacity = dragDx > 0 ? Math.min(0.9, 0.18 + dragDx / SWIPE_FEEDBACK_RANGE) : 0.18;
  const leftNubOpacity = dragDx < 0 ? Math.min(0.9, 0.18 + -dragDx / SWIPE_FEEDBACK_RANGE) : 0.18;

  // Re-locates the selected text as a plain substring of the raw message
  // content, rather than mapping the DOM selection Range to a source offset
  // (which the markdown-rendered text makes unreliable) — simple and robust,
  // at the cost of always seeking to the FIRST occurrence of that text.
  function handleTextSelectionSeek() {
    const selected = window.getSelection()?.toString().trim();
    if (!selected || selected.length < 2) return;
    const offset = message.content.indexOf(selected);
    if (offset >= 0) onSelectSeek(offset);
  }

  return (
    <div
      className="scene-central-box"
      style={{ borderTopColor: agent.color }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={handleSwipeStart}
      onPointerMove={handleSwipeMove}
      onPointerUp={handleSwipeEnd}
      onPointerCancel={handleSwipeCancel}
      onPointerLeave={handleSwipeCancel}
    >
      {/* Swipe hints: a sliver of a circle poking out each edge — right
          (green) for the next message, left (red) for the previous one —
          brightening live as the user actually drags in that direction. */}
      <span
        className="scene-swipe-nub left"
        style={{ opacity: leftNubOpacity, transform: `translateY(-50%) scale(${dragDx < 0 ? 1 + Math.min(-dragDx, SWIPE_FEEDBACK_RANGE) / 400 : 1})` }}
      />
      <span
        className="scene-swipe-nub right"
        style={{ opacity: rightNubOpacity, transform: `translateY(-50%) scale(${dragDx > 0 ? 1 + Math.min(dragDx, SWIPE_FEEDBACK_RANGE) / 400 : 1})` }}
      />
      <div className="scene-central-speaker">
        <span className="scene-central-dot" style={{ background: agent.color }} />
        {agent.refNumber} {agent.name} is speaking
      </div>
      <div className="scene-central-text" ref={scrollRef} onMouseUp={handleTextSelectionSeek}>
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
