'use client';

import { ArchivedConversation } from '@/lib/types';
import { useOverlayClose } from '@/lib/use-overlay-close';

interface ArchivesModalProps {
  archives: ArchivedConversation[];
  onRestore: (archive: ArchivedConversation) => void;
  onDelete: (id: string) => void;
  onUpdateMeta: (id: string, updates: { category?: string | null; color?: string | null }) => void;
  onClose: () => void;
  embedded?: boolean;
}

export function ArchivesModal({ archives, onRestore, onDelete, onUpdateMeta, onClose, embedded }: ArchivesModalProps) {
  const overlayClose = useOverlayClose(onClose);
  const content = (
    <>
      {archives.length === 0 && <div className="empty-state">No archived conversations yet.</div>}
      {archives
        .slice()
        .sort((a, b) => b.archivedAt - a.archivedAt)
        .map((archive) => {
          const messageCount = archive.state.threads.flatMap((t) => t.messages).length;
          return (
            <div
              className="agent-list-item"
              key={archive.id}
              style={{ borderLeft: archive.color ? `4px solid ${archive.color}` : undefined }}
            >
              <input
                type="color"
                value={archive.color ?? '#999999'}
                onChange={(e) => onUpdateMeta(archive.id, { color: e.target.value })}
                title="Color tag"
                style={{ width: 28, height: 28, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
              />
              <div className="agent-info">
                <div className="agent-name">{archive.title}</div>
                <div className="agent-instructions">
                  {new Date(archive.archivedAt).toLocaleString()} · {messageCount} messages ·{' '}
                  {archive.state.agents.length} agents
                </div>
                <input
                  type="text"
                  value={archive.category ?? ''}
                  onChange={(e) => onUpdateMeta(archive.id, { category: e.target.value.trim() || null })}
                  placeholder="Category (optional)"
                  className="compact-field"
                  style={{ marginTop: 4, fontSize: 12 }}
                />
              </div>
              <button className="btn-icon" title="Restore" onClick={() => onRestore(archive)}>
                ♻️
              </button>
              <button className="btn-icon delete" title="Delete" onClick={() => onDelete(archive.id)}>
                🗑️
              </button>
            </div>
          );
        })}
    </>
  );

  if (embedded) return content;

  return (
    <div className="modal-overlay active" {...overlayClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">🗄️ Archived Conversations</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{content}</div>
      </div>
    </div>
  );
}
