'use client';

import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from './admin';

export interface AuthContextValue {
  session: Session;
  profile: UserProfile;
  onSignOut: () => void;
  onOpenAdminPanel: () => void;
}

/**
 * Exposes the signed-in session/profile (and account actions) to any
 * descendant of LoginGate, so account/admin UI can live inside the app's
 * own Settings modal instead of a separate always-visible bar on the main
 * screen. Null when there's no Supabase auth configured for this
 * deployment, or (shouldn't normally happen) no session yet.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue | null {
  return useContext(AuthContext);
}
