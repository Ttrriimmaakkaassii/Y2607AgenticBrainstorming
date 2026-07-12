'use client';

import { useEffect, useState } from 'react';
import { fetchAllProfiles, setApproval, UserProfile } from '@/lib/admin';
import { useOverlayClose } from '@/lib/use-overlay-close';

interface AdminPanelProps {
  onClose: () => void;
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const overlayClose = useOverlayClose(onClose);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    fetchAllProfiles().then((p) => {
      setProfiles(p);
      setLoading(false);
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  async function toggleApproval(userId: string, next: boolean) {
    await setApproval(userId, next);
    refresh();
  }

  const pending = profiles.filter((p) => !p.isApproved && !p.isAdmin);
  const active = profiles.filter((p) => p.isApproved || p.isAdmin);

  return (
    <div className="modal-overlay active" {...overlayClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <span className="modal-title">🛡️ Admin — User Access</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {loading && <div className="empty-state">Loading…</div>}

          <div className="modal-section">
            <div className="modal-section-title">Pending Registration Requests ({pending.length})</div>
            {pending.length === 0 && !loading && (
              <div className="empty-state">No pending requests.</div>
            )}
            {pending.map((p) => (
              <div className="agent-list-item" key={p.userId}>
                <div className="agent-info">
                  <div className="agent-name">{p.email}</div>
                  <div className="agent-instructions">
                    Requested {new Date(p.createdAt).toLocaleString()}
                  </div>
                </div>
                <button className="btn-secondary" style={{ width: 'auto' }} onClick={() => toggleApproval(p.userId, true)}>
                  ✅ Activate
                </button>
              </div>
            ))}
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Active / Admin Users ({active.length})</div>
            {active.map((p) => (
              <div className="agent-list-item" key={p.userId}>
                <div className="agent-info">
                  <div className="agent-name">
                    {p.email} {p.isAdmin && <span title="Super admin">🛡️</span>}
                  </div>
                  <div className="agent-instructions">
                    Joined {new Date(p.createdAt).toLocaleString()}
                  </div>
                </div>
                {!p.isAdmin && (
                  <button
                    className="btn-icon delete"
                    title="Deactivate"
                    onClick={() => toggleApproval(p.userId, false)}
                  >
                    🚫
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
