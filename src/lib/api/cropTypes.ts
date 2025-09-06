import { supabase } from '../supabaseClient';
import type { CropType } from '../types';

export async function listCropTypes(): Promise<CropType[]> {
  const { data, error } = await supabase
    .from('crop_types')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data as CropType[];
}
