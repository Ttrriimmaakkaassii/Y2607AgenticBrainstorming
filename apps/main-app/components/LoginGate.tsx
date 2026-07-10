'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSession, onAuthStateChange, signIn, signOut, signUp, updatePassword } from '@/lib/auth';
import { fetchMyProfile, UserProfile } from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import { AdminPanel } from './AdminPanel';

export function LoginGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
      setChecked(true);
    });
    return onAuthStateChange(setSession);
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setProfileError(null);
      setProfileChecked(false);
      return;
    }
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts += 1;
      const { profile: p, error: err } = await fetchMyProfile(session.user.id);
      if (p || err || attempts > 5) {
        setProfile(p);
        setProfileError(err);
        setProfileChecked(true);
        clearInterval(poll);
      }
    }, 800);
    return () => clearInterval(poll);
  }, [session]);

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
          setInfo(
            'Account created. Confirm your email, then sign in — an admin still needs to activate your account before you can use the app.'
          );
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

  if (profileError) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="auth-title">Setup Required</h1>
          <p style={{ fontSize: 13, color: '#667781' }}>
            The <code>user_profiles</code> table isn&apos;t set up yet in Supabase, so nobody can
            sign in — including admins. Run the SQL in <code>SUPABASE-AUTH-SETUP.md</code>{' '}
            (sections 1b and 1c), then reload this page.
          </p>
          <p className="auth-error">{profileError}</p>
          <button className="btn-secondary" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (!profileChecked) {
    return <div className="auth-loading">Checking account status…</div>;
  }

  if (!profile || !profile.isApproved) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="auth-title">Awaiting Approval</h1>
          <p style={{ fontSize: 13, color: '#667781' }}>
            Signed in as {session.user.email}. An admin needs to activate your account before you
            can access the app.
          </p>
          {!profile && (
            <p style={{ fontSize: 12, color: '#667781' }}>
              No profile record was found for this account yet. If you&apos;re
              trimakassi@gmail.com, run the backfill SQL (section 1c) in{' '}
              <code>SUPABASE-AUTH-SETUP.md</code>.
            </p>
          )}
          <button className="btn-secondary" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
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
        {profile.isAdmin && (
          <button className="btn-icon" onClick={() => setShowAdminPanel(true)} title="Admin panel">
            🛡️
          </button>
        )}
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
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} />}
      {children}
    </>
  );
}
