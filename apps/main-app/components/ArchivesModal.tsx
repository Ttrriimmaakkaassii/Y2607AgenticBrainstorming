'use client';

import { ArchivedConversation } from '@/lib/types';
import { useOverlayClose } from '@/lib/use-overlay-close';

interface ArchivesModalProps {
  archives: ArchivedConversation[];
  onRestore: (archive: ArchivedConversation) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  embedded?: boolean;
}

export function ArchivesModal({ archives, onRestore, onDelete, onClose, embedded }: ArchivesModalProps) {
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
            <div className="agent-list-item" key={archive.id}>
              <div className="agent-info">
                <div className="agent-name">{archive.title}</div>
                <div className="agent-instructions">
                  {new Date(archive.archivedAt).toLocaleString()} · {messageCount} messages ·{' '}
                  {archive.state.agents.length} agents
                </div>
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
