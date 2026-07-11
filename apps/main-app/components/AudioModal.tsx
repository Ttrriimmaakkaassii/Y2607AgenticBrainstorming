'use client';

import { useRef, useState } from 'react';
import { Agent, Message, Thread } from '@/lib/types';
import { pickVoiceForAgent } from '@/lib/voice-picker';
import { fetchGoogleVoices, pickGoogleVoiceForAgent, synthesizeGoogleAudio } from '@/lib/google-tts';
import { loadTtsApiKey } from '@/lib/tts-connection';

interface AudioModalProps {
  agents: Agent[];
  threads: Thread[];
  ttsRate: number;
  ttsLang: string;
  ttsProvider: 'browser' | 'google';
  onUpdateTts: (updates: { ttsRate?: number; ttsLang?: string; ttsProvider?: 'browser' | 'google' }) => void;
  onClose: () => void;
  onToast: (message: string) => void;
  embedded?: boolean;
}

export function AudioModal({
  agents,
  threads,
  ttsRate,
  ttsLang,
  ttsProvider,
  onUpdateTts,
  onClose,
  onToast,
  embedded,
}: AudioModalProps) {
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const messages = threads.flatMap((t) => t.messages);
  const cancelledRef = useRef(false);
  const googleAudioRef = useRef<HTMLAudioElement | null>(null);

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
    if (googleAudioRef.current) {
      googleAudioRef.current.pause();
      googleAudioRef.current = null;
    }
    cancelledRef.current = false;

    function speakAtBrowser(index: number, msg: Message) {
      const agent = agents.find((a) => a.id === msg.agentId);
      const utterance = new SpeechSynthesisUtterance(`${authorName(msg)} says: ${msg.content}`);
      const { voice, pitch, rate } = pickVoiceForAgent(msg.agentId, agent?.voiceURI, ttsLang, ttsRate);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.lang = ttsLang;
      if (voice) utterance.voice = voice;
      utterance.onstart = () => setPlayingIndex(index);
      utterance.onend = () => speakAt(index + 1);
      utterance.onerror = () => speakAt(index + 1);
      window.speechSynthesis.speak(utterance);
    }

    async function speakAtGoogle(index: number, msg: Message, apiKey: string) {
      const agent = agents.find((a) => a.id === msg.agentId);
      const voices = await fetchGoogleVoices(apiKey, ttsLang);
      const voiceName = pickGoogleVoiceForAgent(msg.agentId, agent?.googleVoiceName, voices);
      const audioUrl = voiceName
        ? await synthesizeGoogleAudio(apiKey, `${authorName(msg)} says: ${msg.content}`, ttsLang, voiceName, ttsRate)
        : null;
      if (cancelledRef.current) return;
      if (!audioUrl) {
        onToast('⚠️ Google TTS failed — falling back to the browser voice.');
        speakAtBrowser(index, msg);
        return;
      }
      const audio = new Audio(audioUrl);
      googleAudioRef.current = audio;
      setPlayingIndex(index);
      audio.onended = () => {
        googleAudioRef.current = null;
        speakAt(index + 1);
      };
      audio.onerror = () => {
        googleAudioRef.current = null;
        speakAt(index + 1);
      };
      audio.play();
    }

    function speakAt(index: number) {
      if (cancelledRef.current || index >= messages.length) {
        setPlayingIndex(null);
        return;
      }
      const msg = messages[index];
      const apiKey = loadTtsApiKey();
      if (ttsProvider === 'google' && apiKey) {
        speakAtGoogle(index, msg, apiKey);
        return;
      }
      speakAtBrowser(index, msg);
    }

    speakAt(startIndex);
    onToast('▶️ Playing from selected message');
  }

  function stopSpeaking() {
    cancelledRef.current = true;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (googleAudioRef.current) {
      googleAudioRef.current.pause();
      googleAudioRef.current = null;
    }
    setPlayingIndex(null);
    onToast('⏹️ Playback stopped');
  }

  const content = (
    <>
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
          <label>TTS Engine</label>
          <select
            value={ttsProvider}
            onChange={(e) => onUpdateTts({ ttsProvider: e.target.value as 'browser' | 'google' })}
          >
            <option value="browser">🔊 Browser (free, built-in)</option>
            <option value="google">☁️ Google Cloud (higher quality — needs an API key in 🔌 LLM)</option>
          </select>
        </div>
        <div className="form-group">
          <label>Voice Speed</label>
          <input
            type="number"
            min={0.5}
            max={2}
            step={0.1}
            value={ttsRate}
            onChange={(e) => onUpdateTts({ ttsRate: Number(e.target.value) || 1 })}
          />
        </div>
        <div className="form-group">
          <label>Voice Language</label>
          <select value={ttsLang} onChange={(e) => onUpdateTts({ ttsLang: e.target.value })}>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="en-AU">English (Australia)</option>
            <option value="en-CA">English (Canada)</option>
            <option value="en-IN">English (India)</option>
            <option value="es-ES">Spanish</option>
            <option value="fr-FR">French (France)</option>
            <option value="fr-CA">French (Canada)</option>
            <option value="fr-BE">French (Belgium)</option>
            <option value="fr-CH">French (Switzerland)</option>
            <option value="de-DE">German</option>
            <option value="pt-BR">Portuguese (BR)</option>
            <option value="it-IT">Italian</option>
            <option value="zh-CN">Chinese (Mandarin)</option>
            <option value="ja-JP">Japanese</option>
            <option value="hi-IN">Hindi</option>
            <option value="ar-SA">Arabic (Saudi Arabia)</option>
            <option value="ar-EG">Arabic (Egypt)</option>
            <option value="ar-AE">Arabic (UAE)</option>
            <option value="ar-MA">Arabic (Morocco)</option>
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
          By default, playback uses your browser&apos;s built-in text-to-speech engine — free, but
          voice quality depends on your device. Add your own Google Cloud TTS API key in 🔌 LLM → TTS
          API and switch the TTS Engine above to Google Cloud for more natural, realistic voices.
        </div>
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <span className="modal-title">🎧 Listen to Conversation</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{content}</div>
      </div>
    </div>
  );
}
