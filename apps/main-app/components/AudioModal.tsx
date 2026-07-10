'use client';

import { useState } from 'react';
import { Agent, Thread } from '@/lib/types';

interface AudioModalProps {
  agents: Agent[];
  threads: Thread[];
  onClose: () => void;
  onToast: (message: string) => void;
}

export function AudioModal({ agents, threads, onClose, onToast }: AudioModalProps) {
  const [scope, setScope] = useState<'all' | 'last5'>('all');
  const [speed, setSpeed] = useState<'normal' | 'fast' | 'slow'>('normal');

  function getMessages() {
    const all = threads.flatMap((t) => t.messages);
    return scope === 'last5' ? all.slice(-5) : all;
  }

  function speak() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onToast('Speech synthesis is not supported in this browser.');
      return;
    }
    const messages = getMessages();
    if (messages.length === 0) {
      onToast('No messages to play yet.');
      return;
    }
    window.speechSynthesis.cancel();
    const rate = speed === 'fast' ? 1.4 : speed === 'slow' ? 0.7 : 1;
    messages.forEach((msg) => {
      const agent = agents.find((a) => a.id === msg.agentId);
      const utterance = new SpeechSynthesisUtterance(
        `${agent ? agent.name : 'You'} says: ${msg.content}`
      );
      utterance.rate = rate;
      window.speechSynthesis.speak(utterance);
    });
    onToast('▶️ Playing conversation audio');
  }

  function stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      onToast('⏹️ Playback stopped');
    }
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">🎧 Listen to Conversation</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">Text-to-Speech Playback</div>
            <div className="form-group">
              <label>Scope</label>
              <select value={scope} onChange={(e) => setScope(e.target.value as any)}>
                <option value="all">Full Conversation</option>
                <option value="last5">Last 5 Messages</option>
              </select>
            </div>
            <div className="form-group">
              <label>Speech Rate</label>
              <select value={speed} onChange={(e) => setSpeed(e.target.value as any)}>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
                <option value="slow">Slow</option>
              </select>
            </div>
            <button className="btn-primary" onClick={speak}>
              ▶️ Play Audio
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
