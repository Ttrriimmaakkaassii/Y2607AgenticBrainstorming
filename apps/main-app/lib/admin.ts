import { supabase } from './supabase';

export interface UserProfile {
  userId: string;
  email: string;
  isAdmin: boolean;
  isApproved: boolean;
  createdAt: string;
}

function mapRow(row: any): UserProfile {
  return {
    userId: row.user_id,
    email: row.email,
    isAdmin: row.is_admin,
    isApproved: row.is_approved,
    createdAt: row.created_at,
  };
}

export interface ProfileResult {
  profile: UserProfile | null;
  /** Set when the query itself failed (e.g. user_profiles table/trigger not set up yet) —
   * distinct from a successful query that simply found no row. */
  error: string | null;
}

/** The signed-in user's own profile — always readable under RLS. */
export async function fetchMyProfile(userId: string): Promise<ProfileResult> {
  if (!supabase) return { profile: null, error: null };
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { profile: null, error: error.message };
  return { profile: data ? mapRow(data) : null, error: null };
}

/** All profiles — RLS only actually returns rows if the caller is an admin. */
export async function fetchAllProfiles(): Promise<UserProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapRow);
}

export async function setApproval(userId: string, isApproved: boolean): Promise<void> {
  if (!supabase) return;
  await supabase.from('user_profiles').update({ is_approved: isApproved }).eq('user_id', userId);
}

/**
 * The conversation the user was last working on, tracked per-account (not
 * per-browser), so signing in on a different device/browser resumes the
 * same conversation instead of starting a new blank one.
 */
export async function getCurrentConversationId(userId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('current_conversation_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.current_conversation_id ?? null;
}

export async function setCurrentConversationId(userId: string, conversationId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('user_profiles')
    .update({ current_conversation_id: conversationId })
    .eq('user_id', userId);
}
