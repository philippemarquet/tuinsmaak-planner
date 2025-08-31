import { supabase } from '../supabaseClient';
import type { Profile } from '../types';

export async function getMyProfile(): Promise<Profile | null> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.user.id).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function updateMyProfile(patch: Partial<Profile>): Promise<Profile> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.user.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Profile;
}
