'use client';

import { Agent, ConversationState, Thread } from '@/lib/types';
import { buildConversationMindmapMarkdown } from '@/lib/mindmap';

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
    `- Mood: ${state.settings.mood}`,
    '',
    `## Transcript`,
    '',
    buildTranscript(state),
  ];
  return lines.join('\n');
}

export function ExportModal({ state, onClose, onToast, onOpenMindmap }: ExportModalProps) {
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
    <div className="modal-overlay active" onClick={onClose}>
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
        </div>
      </div>
    </div>
  );
}
