import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response('Missing token', { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find user by calendar token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('calendar_token', token)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('Profile lookup error:', profileError);
      return new Response('Invalid token', { status: 401, headers: corsHeaders });
    }

    // Get user's gardens
    const { data: gardenUsers } = await supabase
      .from('garden_users')
      .select('garden_id')
      .eq('user_id', profile.id);

    if (!gardenUsers || gardenUsers.length === 0) {
      return generateICS([]);
    }

    const gardenIds = gardenUsers.map((gu) => gu.garden_id);

    // Get all tasks for user's gardens
    const { data: tasks } = await supabase
      .from('tasks')
      .select(`
        id,
        type,
        due_date,
        status,
        planting_id,
        plantings!inner (
          id,
          garden_bed_id,
          start_segment,
          segments_used,
          seeds!inner (
            name
          ),
          garden_beds!inner (
            name
          )
        )
      `)
      .in('garden_id', gardenIds)
      .order('due_date', { ascending: true });

    return generateICS(tasks || []);
  } catch (err) {
    console.error('Calendar feed error:', err);
    return new Response('Internal server error', { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }
});

function generateICS(tasks: any[]) {
  const now = new Date();
  const dtstamp = formatICSDate(now);

  let ical = `BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//Moestuinplanner//NL\r
CALSCALE:GREGORIAN\r
METHOD:PUBLISH\r
X-WR-CALNAME:Moestuin Acties\r
X-WR-TIMEZONE:Europe/Amsterdam\r
`;

  for (const task of tasks) {
    const planting = task.plantings;
    if (!planting || !planting.seeds) continue;

    const seedName = planting.seeds.name;
    const bedName = planting.garden_beds?.name || 'Onbekend';
    const segment = planting.start_segment !== null && planting.segments_used !== null
      ? ` • Segment ${planting.start_segment === 0 ? '1' : planting.start_segment}-${planting.start_segment + planting.segments_used - 1}`
      : '';

    const typeLabels: Record<string, string> = {
      sow: '🌱 Zaaien',
      plant_out: '🌿 Uitplanten',
      harvest_start: '🥕 Oogsten',
      harvest_end: '🎯 Oogst afronden',
    };

    const summary = `${typeLabels[task.type] || task.type}: ${seedName}`;
    const description = `${bedName}${segment}`;
    const status = task.status === 'done' ? 'CONFIRMED' : 'TENTATIVE';
    const uid = `task-${task.id}@moestuinplanner`;
    const dtstart = formatICSDate(new Date(task.due_date));

    ical += `BEGIN:VEVENT\r
UID:${uid}\r
DTSTAMP:${dtstamp}\r
DTSTART;VALUE=DATE:${dtstart}\r
SUMMARY:${summary}\r
DESCRIPTION:${description}\r
STATUS:${status}\r
TRANSP:TRANSPARENT\r
END:VEVENT\r
`;
  }

  ical += `END:VCALENDAR\r
`;

  return new Response(ical, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="moestuin.ics"',
    },
  });
}

function formatICSDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}
