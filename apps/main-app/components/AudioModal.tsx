'use client';

import { useRef, useState } from 'react';
import { Agent, Message, Thread } from '@/lib/types';

interface AudioModalProps {
  agents: Agent[];
  threads: Thread[];
  onClose: () => void;
  onToast: (message: string) => void;
}

export function AudioModal({ agents, threads, onClose, onToast }: AudioModalProps) {
  const [speed, setSpeed] = useState<'normal' | 'fast' | 'slow'>('normal');
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const messages = threads.flatMap((t) => t.messages);
  const cancelledRef = useRef(false);

  function authorName(msg: Message): string {
    if (msg.agentId === 'user') return 'You';
    const agent = agents.find((a) => a.id === msg.agentId);
    return agent ? `${agent.refNumber} ${agent.name}` : 'Unknown';
  }

  function playFrom(startIndex: number) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onToast('Speech synthesis is not supported in this browser.');
      return;
    }
    if (messages.length === 0) {
      onToast('No messages to play yet.');
      return;
    }
    window.speechSynthesis.cancel();
    cancelledRef.current = false;
    const rate = speed === 'fast' ? 1.4 : speed === 'slow' ? 0.7 : 1;

    function speakAt(index: number) {
      if (cancelledRef.current || index >= messages.length) {
        setPlayingIndex(null);
        return;
      }
      const msg = messages[index];
      const utterance = new SpeechSynthesisUtterance(`${authorName(msg)} says: ${msg.content}`);
      utterance.rate = rate;
      utterance.onstart = () => setPlayingIndex(index);
      utterance.onend = () => speakAt(index + 1);
      utterance.onerror = () => speakAt(index + 1);
      window.speechSynthesis.speak(utterance);
    }

    speakAt(startIndex);
    onToast('▶️ Playing from selected message');
  }

  function stopSpeaking() {
    cancelledRef.current = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingIndex(null);
    onToast('⏹️ Playback stopped');
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <span className="modal-title">🎧 Listen to Conversation</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">Now Playing</div>
            {messages.length === 0 && <div className="empty-state">No messages yet.</div>}
            <div className="audio-track-viewer">
              {messages.map((msg, i) => (
                <button
                  key={msg.id}
                  className={`audio-track-chip ${playingIndex === i ? 'playing' : ''}`}
                  onClick={() => playFrom(i)}
                  title={`Play from: ${authorName(msg)} — ${msg.content.slice(0, 60)}`}
                >
                  <span className="audio-track-author">{authorName(msg)}</span>
                  <span className="audio-track-snippet">{msg.content.slice(0, 40)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="modal-section">
            <div className="form-group">
              <label>Speech Rate</label>
              <select value={speed} onChange={(e) => setSpeed(e.target.value as any)}>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
                <option value="slow">Slow</option>
              </select>
            </div>
            <button className="btn-primary" onClick={() => playFrom(0)}>
              ▶️ Play From Start
            </button>
            <button className="btn-secondary" onClick={stopSpeaking} style={{ marginTop: 8 }}>
              ⏹️ Stop
            </button>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">Note</div>
            <div style={{ fontSize: 12, color: '#667781' }}>
              Playback uses your browser&apos;s built-in text-to-speech engine, so no audio file
              can be downloaded from here — MP3 export would require a server-side TTS provider
              (e.g. ElevenLabs) that isn&apos;t configured for this deployment yet.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
