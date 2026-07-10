'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSession, onAuthStateChange, signIn, signOut, signUp, updatePassword } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function LoginGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      setChecked(true);
    });
    return onAuthStateChange(setSession);
  }, []);

  if (!supabase) {
    // No Supabase configured for this deployment — don't block the app.
    return <>{children}</>;
  }

  if (!checked) {
    return <div className="auth-loading">Loading…</div>;
  }

  if (!session) {
    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError('');
      setInfo('');
      try {
        if (mode === 'signUp') {
          await signUp(email, password);
          setInfo('Account created. Check your email to confirm, then sign in.');
          setMode('signIn');
        } else {
          await signIn(email, password);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    }

    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1 className="auth-title">{mode === 'signIn' ? 'Sign In' : 'Create Account'}</h1>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          {info && <div className="auth-info">{info}</div>}
          <button className="btn-primary" type="submit">
            {mode === 'signIn' ? 'Sign In' : 'Create Account'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 8 }}
            onClick={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              setError('');
              setInfo('');
            }}
          >
            {mode === 'signIn' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
        </form>
      </div>
    );
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
      <div className="account-bar">
        <span className="account-email">{session.user.email}</span>
        <button className="btn-icon" onClick={() => setShowAccountMenu((v) => !v)} title="Account">
          ⚙️
        </button>
        <button className="btn-icon" onClick={() => signOut()} title="Sign out">
          🚪
        </button>
      </div>
      {showAccountMenu && (
        <div className="modal-overlay active" onClick={() => setShowAccountMenu(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Account</span>
              <button className="modal-close" onClick={() => setShowAccountMenu(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
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
          </div>
        </div>
      )}
      {children}
    </>
  );
}
