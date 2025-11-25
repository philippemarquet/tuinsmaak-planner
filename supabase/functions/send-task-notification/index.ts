import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";
import React from 'npm:react@18.3.1';
import { renderAsync } from 'npm:@react-email/components@0.0.22';
import { TaskReminderEmail } from './_templates/task-reminder.tsx';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TaskNotificationRequest {
  taskId: string;
  userId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { taskId, userId }: TaskNotificationRequest = await req.json();

    // Haal taak informatie op
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select(`
        *,
        plantings!inner (
          seed_id,
          garden_bed_id,
          seeds (name),
          garden_beds (name)
        )
      `)
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      throw new Error('Task niet gevonden');
    }

    // Haal gebruiker profiel op
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('display_name, id')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new Error('Profiel niet gevonden');
    }

    // Haal user email op via auth API
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
    
    if (userError || !user?.email) {
      throw new Error('Gebruiker email niet gevonden');
    }

    // Map task type naar Nederlandse labels
    const taskTypeLabels: Record<string, string> = {
      sow: 'Zaaien',
      plant_out: 'Uitplanten',
      harvest_start: 'Start oogst',
      harvest_end: 'Einde oogst',
    };

    const taskTypeLabel = taskTypeLabels[task.type] || task.type;
    const seedName = task.plantings?.seeds?.name || 'Onbekend gewas';
    const bedName = task.plantings?.garden_beds?.name || 'Onbekende bak';
    const dueDate = new Date(task.due_date).toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // Render email template
    const html = await renderAsync(
      React.createElement(TaskReminderEmail, {
        userName: profile.display_name || 'Tuinier',
        taskType: taskTypeLabel,
        seedName,
        bedName,
        dueDate,
        appUrl: supabaseUrl.replace('.supabase.co', '.lovable.app') || 'https://your-app.lovable.app',
      })
    );

    // Verstuur email
    const { error: emailError } = await resend.emails.send({
      from: 'Tuinplanner <onboarding@resend.dev>',
      to: [user.email],
      subject: `🌱 Herinnering: ${taskTypeLabel} voor ${seedName}`,
      html,
    });

    if (emailError) {
      throw emailError;
    }

    console.log('Email verzonden naar:', user.email);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-task-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
