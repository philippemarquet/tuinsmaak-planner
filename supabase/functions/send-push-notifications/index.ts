import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushSubscription {
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

interface Task {
  id: string;
  type: string;
  due_date: string;
  planting_id: string;
  plantings: {
    seed_id: string;
    seeds: {
      name: string;
    };
  };
}

async function sendWebPush(
  subscription: PushSubscription,
  payload: { title: string; body: string; data?: any }
): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('VAPID keys not configured');
    return;
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh_key,
      auth: subscription.auth_key,
    },
  };

  try {
    // Voor nu loggen we alleen - web-push implementatie volgt
    console.log('Would send push to:', subscription.endpoint);
    console.log('Payload:', payload);
    
    // TODO: Implementeer echte web-push met web-push library
    // Dit vereist de web-push npm package die nog geïnstalleerd moet worden
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Haal taken op die vandaag of morgen gepland zijn
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select(`
        id,
        type,
        due_date,
        planting_id,
        plantings!inner (
          seed_id,
          garden_id,
          seeds!inner (
            name
          )
        )
      `)
      .eq('status', 'pending')
      .gte('due_date', today)
      .lte('due_date', tomorrow) as { data: Task[] | null; error: any };

    if (tasksError) throw tasksError;
    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ message: 'No tasks to notify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Groepeer taken per gebruiker (via garden_id -> garden_users)
    const gardenIds = [...new Set(tasks.map((t) => (t.plantings as any).garden_id))];
    
    const { data: gardenUsers, error: guError } = await supabase
      .from('garden_users')
      .select('user_id, garden_id')
      .in('garden_id', gardenIds);

    if (guError) throw guError;

    // Haal profielen op met notification preferences
    const userIds = [...new Set(gardenUsers?.map((gu) => gu.user_id) || [])];
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, notification_prefs')
      .in('id', userIds);

    if (profilesError) throw profilesError;

    // Haal push subscriptions op
    const { data: subscriptions, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds) as { data: PushSubscription[] | null; error: any };

    if (subsError) throw subsError;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: 'No subscriptions found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verstuur notificaties
    let sent = 0;
    for (const subscription of subscriptions) {
      const profile = profiles?.find((p) => p.id === subscription.user_id);
      const prefs = profile?.notification_prefs || {};
      
      const userGardens = gardenUsers?.filter((gu) => gu.user_id === subscription.user_id).map((gu) => gu.garden_id) || [];
      const userTasks = tasks.filter((t) => userGardens.includes((t.plantings as any).garden_id));

      for (const task of userTasks) {
        let shouldNotify = false;
        let title = 'Tuintaak';
        let body = '';

        if (task.type === 'sow' && prefs.remind_sow) {
          shouldNotify = true;
          title = '🌱 Zaaien';
          body = `Tijd om ${(task.plantings as any).seeds.name} te zaaien`;
        } else if (task.type === 'plant_out' && prefs.remind_plant) {
          shouldNotify = true;
          title = '🌿 Uitplanten';
          body = `Tijd om ${(task.plantings as any).seeds.name} uit te planten`;
        } else if ((task.type === 'harvest_start' || task.type === 'harvest_end') && prefs.remind_harvest) {
          shouldNotify = true;
          title = '🥬 Oogsten';
          body = `Tijd om ${(task.plantings as any).seeds.name} te oogsten`;
        }

        if (shouldNotify) {
          await sendWebPush(subscription, {
            title,
            body,
            data: { url: '/', taskId: task.id },
          });
          sent++;
        }
      }
    }

    return new Response(
      JSON.stringify({ message: `Sent ${sent} notifications` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
