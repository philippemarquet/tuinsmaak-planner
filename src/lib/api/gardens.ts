import { supabase } from '../supabaseClient';
import type { Garden, GardenUser, Profile, UUID } from '../types';

export async function ensureMyProfile(displayName?: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');
  const id = user.user.id as UUID;

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (existing) return existing as Profile;

  const { data, error } = await supabase
    .from('profiles')
    .insert({ id, display_name: displayName ?? user.user.email?.split('@')[0] })
    .select('*')
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function createGarden(name: string) {
  const { data, error } = await supabase
    .from('gardens')
    .insert({ name })
    .select('*')
    .single();
  if (error) throw error;

  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new Error('Not authenticated');
  const { error: guErr } = await supabase
    .from('garden_users')
    .insert({ garden_id: data.id, user_id: me.user.id, role: 'owner' });
  if (guErr) throw guErr;

  return data as Garden;
}

export async function myGardens(): Promise<Garden[]> {
  const { data, error } = await supabase.from('gardens').select('*');
  if (error) throw error;
  return data as Garden[];
}

export async function getGarden(id: UUID): Promise<Garden | null> {
  const { data, error } = await supabase
    .from('gardens')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as Garden) ?? null;
}

export async function getMyMemberships(): Promise<GardenUser[]> {
  const { data, error } = await supabase.from('garden_users').select('*');
  if (error) throw error;
  return data as GardenUser[];
}

export async function joinGardenByCode(code: string): Promise<Garden> {
  const { data, error } = await supabase.rpc('join_garden_by_code', { join_code: code });
  if (error) throw error;
  const gardenId = data as UUID;
  const garden = await getGarden(gardenId);
  if (!garden) throw new Error('Joined, but garden not found');
  return garden;
}
