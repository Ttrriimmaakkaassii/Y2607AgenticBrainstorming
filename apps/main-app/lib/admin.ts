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

/** The signed-in user's own profile — always readable under RLS. */
export async function fetchMyProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
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
