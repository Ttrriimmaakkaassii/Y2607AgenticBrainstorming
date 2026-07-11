'use client';

import { useState } from 'react';
import { updatePassword } from '@/lib/auth';
import { useAuthContext } from '@/lib/auth-context';

/**
 * Account/admin controls, embedded as a Settings tab instead of a separate
 * always-visible bar on the main screen. Self-sufficient via AuthContext —
 * no props needed.
 */
export function AccountSettingsPanel() {
  const auth = useAuthContext();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (!auth) {
    return <div className="empty-state">Account features aren&apos;t configured for this deployment.</div>;
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    try {
      await updatePassword(newPassword);
      setInfo('Password updated.');
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <>
      <div className="modal-section">
        <div className="modal-section-title">Signed in</div>
        <div className="form-group">
          <span>{auth.session.user.email}</span>
        </div>
        {auth.profile.isAdmin && (
          <button className="btn-secondary" onClick={auth.onOpenAdminPanel}>
            🛡️ Admin Panel
          </button>
        )}
        <button className="btn-secondary" onClick={auth.onSignOut} style={{ marginTop: 8 }}>
          🚪 Sign Out
        </button>
      </div>

      <div className="modal-section">
        <div className="modal-section-title">Change Password</div>
        <form onSubmit={handleChangePassword}>
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          {info && <div className="auth-info">{info}</div>}
          <button className="btn-primary" type="submit">
            Change Password
          </button>
        </form>
      </div>
    </>
  );
}
