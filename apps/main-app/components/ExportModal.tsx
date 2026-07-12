'use client';

import { useState } from 'react';
import { Agent, ConversationState, Thread } from '@/lib/types';
import { buildConversationMindmapMarkdown } from '@/lib/mindmap';
import { useOverlayClose } from '@/lib/use-overlay-close';
import {
  PodcastResult,
  loadCustomPodcastBaseUrl,
  loadCustomTtsApiKey,
  podcastizeConversation,
  saveCustomPodcastBaseUrl,
} from '@/lib/custom-tts';
import { pickGoogleVoiceForAgent } from '@/lib/google-tts';

interface ExportModalProps {
  state: ConversationState;
  onClose: () => void;
  onToast: (message: string) => void;
  onOpenMindmap: (markdown: string, title: string) => void;
}

function download(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function agentName(agents: Agent[], agentId: string): string {
  if (agentId === 'user') return 'You';
  return agents.find((a) => a.id === agentId)?.name ?? 'Unknown Agent';
}

function buildTranscript(state: ConversationState): string {
  const lines: string[] = [`# Conversation Transcript`, ''];
  state.threads.forEach((thread, i) => {
    lines.push(`## Thread ${i + 1} (${agentName(state.agents, thread.agentId)})`, '');
    thread.messages.forEach((msg) => {
      const time = new Date(msg.timestamp).toLocaleString();
      lines.push(`**${agentName(state.agents, msg.agentId)}** _(${time})_`);
      lines.push(msg.content, '');
    });
  });
  return lines.join('\n');
}

function buildOutline(state: ConversationState): string {
  const lines: string[] = [`# Mind Map Outline`, ''];
  state.threads.forEach((thread, i) => {
    lines.push(`- Thread ${i + 1}: ${agentName(state.agents, thread.agentId)}`);
    thread.messages.forEach((msg) => {
      lines.push(`  - ${agentName(state.agents, msg.agentId)}: ${msg.content.slice(0, 80)}`);
    });
  });
  return lines.join('\n');
}

function buildReport(state: ConversationState): string {
  const allMessages = state.threads.flatMap((t) => t.messages);
  const likes = allMessages.filter((m) => m.feedback === 'like').length;
  const dislikes = allMessages.filter((m) => m.feedback === 'dislike').length;
  const lines = [
    `# Conversation Report`,
    '',
    `- Generated: ${new Date().toLocaleString()}`,
    `- Agents: ${state.agents.map((a) => a.name).join(', ')}`,
    `- Threads: ${state.threads.length}`,
    `- Total messages: ${allMessages.length}`,
    `- Likes: ${likes}`,
    `- Dislikes: ${dislikes}`,
    `- Moods: ${state.settings.moods.join(', ')}`,
    '',
    `## Transcript`,
    '',
    buildTranscript(state),
  ];
  return lines.join('\n');
}

export function ExportModal({ state, onClose, onToast, onOpenMindmap }: ExportModalProps) {
  const overlayClose = useOverlayClose(onClose);
  const [podcastBaseUrl, setPodcastBaseUrl] = useState(() => loadCustomPodcastBaseUrl());
  const [podcastFeedSlug, setPodcastFeedSlug] = useState('');
  const [podcastTitle, setPodcastTitle] = useState(state.settings.topic || 'Untitled Episode');
  const [podcastDescription, setPodcastDescription] = useState('');
  const [podcastStatus, setPodcastStatus] = useState<'idle' | 'working' | 'ok' | 'fail'>('idle');
  const [podcastResult, setPodcastResult] = useState<PodcastResult | null>(null);
  const [podcastError, setPodcastError] = useState<string | null>(null);

  async function createPodcastEpisode() {
    saveCustomPodcastBaseUrl(podcastBaseUrl);
    const apiKey = loadCustomTtsApiKey();
    if (!apiKey.trim()) {
      onToast('Add your Custom TTS API key in 🔌 LLM → Custom TTS API first.');
      return;
    }
    const allMessages = state.threads
      .flatMap((t) => t.messages)
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp);
    const segments = allMessages.map((msg) => {
      const author = msg.agentId === 'user' ? null : state.agents.find((a) => a.id === msg.agentId);
      const voice =
        msg.agentId === 'user'
          ? pickGoogleVoiceForAgent('user', null)
          : pickGoogleVoiceForAgent(msg.agentId, author?.googleVoiceName);
      return { speaker: agentName(state.agents, msg.agentId), text: msg.content, voice };
    });
    setPodcastStatus('working');
    setPodcastError(null);
    setPodcastResult(null);
    const { ok, result, error } = await podcastizeConversation(
      podcastBaseUrl,
      apiKey,
      podcastFeedSlug,
      podcastTitle,
      podcastDescription,
      segments
    );
    if (ok && result) {
      setPodcastStatus('ok');
      setPodcastResult(result);
      onToast('🎙️ Podcast episode created');
    } else {
      setPodcastStatus('fail');
      setPodcastError(error ?? 'Podcast creation failed');
      onToast(`❌ ${error ?? 'Podcast creation failed'}`);
    }
  }

  function exportJSON() {
    download('conversation.json', JSON.stringify(state, null, 2), 'application/json');
    onToast('📋 Downloaded JSON');
  }

  function exportMarkdown() {
    download('conversation.md', buildTranscript(state), 'text/markdown');
    onToast('📝 Downloaded Markdown');
  }

  function exportMindmapOutline() {
    download('mindmap-outline.md', buildOutline(state), 'text/markdown');
    onToast('🗺️ Downloaded mind map outline');
  }

  function openMindmap() {
    const markdown = buildConversationMindmapMarkdown(
      state.agents,
      state.threads,
      state.settings.topic
    );
    onOpenMindmap(markdown, state.settings.topic || 'Conversation Mind Map');
  }

  function exportReport() {
    download('report.md', buildReport(state), 'text/markdown');
    onToast('📊 Downloaded report');
  }

  function exportPDF() {
    onToast('📄 Opening print dialog — choose "Save as PDF"');
    window.print();
  }

  return (
    <div className="modal-overlay active" {...overlayClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">📥 Export Options</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">Download Formats</div>
            <button className="btn-secondary" onClick={exportPDF}>
              📄 Print / Save as PDF
            </button>
            <button className="btn-secondary" onClick={exportMarkdown}>
              📝 Download Markdown Transcript
            </button>
            <button className="btn-secondary" onClick={exportJSON}>
              📋 Download JSON
            </button>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">Reports</div>
            <button className="btn-secondary" onClick={exportReport}>
              📊 Generate Report
            </button>
            <button className="btn-secondary" onClick={openMindmap}>
              🗺️ Open Interactive Mind Map
            </button>
            <button className="btn-secondary" onClick={exportMindmapOutline}>
              📝 Download Mind Map Outline (.md)
            </button>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">🎙️ Turn into Podcast Episode</div>
            <div className="form-group">
              <label>Podcast Base URL</label>
              <input
                type="text"
                value={podcastBaseUrl}
                onChange={(e) => setPodcastBaseUrl(e.target.value)}
                placeholder="https://your-tts-service.example.workers.dev"
              />
            </div>
            <div className="form-group">
              <label>Feed Slug (must already exist on the service)</label>
              <input
                type="text"
                value={podcastFeedSlug}
                onChange={(e) => setPodcastFeedSlug(e.target.value)}
                placeholder="my-show"
              />
            </div>
            <div className="form-group">
              <label>Episode Title</label>
              <input type="text" value={podcastTitle} onChange={(e) => setPodcastTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Description (optional)</label>
              <input
                type="text"
                value={podcastDescription}
                onChange={(e) => setPodcastDescription(e.target.value)}
              />
            </div>
            <button
              className="btn-secondary"
              onClick={createPodcastEpisode}
              disabled={podcastStatus === 'working'}
            >
              {podcastStatus === 'working' ? '🔄 Creating episode…' : '🎙️ Create Podcast Episode'}
            </button>
            {podcastStatus === 'ok' && podcastResult && (
              <div style={{ fontSize: 12, marginTop: 8 }}>
                <div>✅ Episode created ({(podcastResult.bytes / 1024).toFixed(0)} KB)</div>
                <div style={{ marginTop: 4 }}>
                  <a href={podcastResult.audioUrl} target="_blank" rel="noreferrer">
                    ▶️ Listen to episode
                  </a>
                </div>
                <div style={{ marginTop: 4 }}>
                  <a href={podcastResult.feedUrl} target="_blank" rel="noreferrer">
                    📡 RSS feed
                  </a>{' '}
                  — paste this URL into any podcast app
                </div>
              </div>
            )}
            {podcastStatus === 'fail' && podcastError && (
              <div className="auth-error" style={{ marginTop: 8 }}>
                {podcastError}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#667781', marginTop: 6 }}>
              Every message in this conversation becomes a segment, spoken in a voice assigned per
              agent (same deterministic assignment used for read-aloud). Uses the same API key as
              🔌 LLM → Custom TTS API — set that up first. The feed slug must already exist on your
              service.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
