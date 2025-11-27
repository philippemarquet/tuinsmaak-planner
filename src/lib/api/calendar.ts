import { supabase } from '../supabaseClient';

export async function resetCalendarToken(): Promise<string> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  // Generate new token
  const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const { error } = await supabase
    .from('profiles')
    .update({ calendar_token: newToken })
    .eq('id', user.user.id);

  if (error) throw error;
  return newToken;
}

export function getCalendarFeedUrl(token: string): string {
  const supabaseUrl = 'https://vthnoxhniporvldavflj.supabase.co';
  return `${supabaseUrl}/functions/v1/calendar-feed?token=${token}`;
}
