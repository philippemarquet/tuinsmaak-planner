import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";
import React from 'npm:react@18.3.1';
import { renderAsync } from 'npm:@react-email/components@0.0.22';
import { WeeklyDigestEmail } from './_templates/weekly-digest.tsx';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WeeklyTask {
  type: string;
  typeLabel: string;
  seedName: string;
  bedName: string;
  dueDate: string;
  isOverdue: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Haal alle gebruikers op met weekly_digest enabled
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, notification_prefs');

    if (profilesError) throw profilesError;

    console.log(`Found ${profiles?.length || 0} profiles to check`);

    const today = new Date();
    const currentDay = today.getDay(); // 0=zondag, 1=maandag, etc.
    const currentTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

    const taskTypeLabels: Record<string, string> = {
      sow: 'Zaaien',
      plant_out: 'Uitplanten',
      harvest_start: 'Start oogst',
      harvest_end: 'Einde oogst',
    };

    let emailsSent = 0;
    let errors = 0;

    for (const profile of profiles || []) {
      try {
        const prefs = profile.notification_prefs as any;
        
        // Check of deze gebruiker vandaag een digest moet ontvangen
        if (!prefs?.email_notifications || !prefs?.weekly_digest) {
          continue;
        }

        const digestDay = prefs.digest_day ?? 1; // Default maandag
        const digestTime = prefs.digest_time ?? '08:00';

        // Check of het de juiste dag en tijd is (binnen 1 uur marge)
        if (digestDay !== currentDay) {
          continue;
        }

        const [targetHour] = digestTime.split(':').map(Number);
        const currentHour = today.getHours();
        
        // Alleen versturen als we binnen het uur zijn
        if (Math.abs(currentHour - targetHour) > 0) {
          continue;
        }

        console.log(`Processing digest for user ${profile.id}`);

        // Haal user email op
        const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(profile.id);
        
        if (userError || !user?.email) {
          console.error(`Could not get email for user ${profile.id}:`, userError);
          errors++;
          continue;
        }

        // Haal alle tuinen op waar gebruiker lid van is
        const { data: gardens, error: gardensError } = await supabase
          .from('garden_users')
          .select('garden_id')
          .eq('user_id', profile.id);

        if (gardensError || !gardens || gardens.length === 0) {
          console.log(`No gardens found for user ${profile.id}`);
          continue;
        }

        const gardenIds = gardens.map(g => g.garden_id);

        // Haal alle openstaande taken op
        const oneWeekFromNow = new Date(today);
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

        const { data: tasks, error: tasksError } = await supabase
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
          .in('garden_id', gardenIds)
          .eq('status', 'pending')
          .lte('due_date', oneWeekFromNow.toISOString().split('T')[0]);

        if (tasksError) throw tasksError;

        if (!tasks || tasks.length === 0) {
          console.log(`No tasks found for user ${profile.id}`);
          continue;
        }

        // Splits taken in achterstallig en aankomend
        const overdueTasks: WeeklyTask[] = [];
        const upcomingTasks: WeeklyTask[] = [];

        for (const task of tasks) {
          const taskDueDate = new Date(task.due_date);
          const isOverdue = taskDueDate < today;

          const weeklyTask: WeeklyTask = {
            type: task.type,
            typeLabel: taskTypeLabels[task.type] || task.type,
            seedName: task.plantings?.seeds?.name || 'Onbekend gewas',
            bedName: task.plantings?.garden_beds?.name || 'Onbekende bak',
            dueDate: taskDueDate.toLocaleDateString('nl-NL', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            }),
            isOverdue,
          };

          if (isOverdue) {
            overdueTasks.push(weeklyTask);
          } else {
            upcomingTasks.push(weeklyTask);
          }
        }

        // Sorteer taken op datum
        overdueTasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        upcomingTasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

        // Render email template
        const html = await renderAsync(
          React.createElement(WeeklyDigestEmail, {
            userName: profile.display_name || 'Tuinier',
            overdueTasks,
            upcomingTasks,
            appUrl: supabaseUrl.replace('.supabase.co', '.lovable.app') || 'https://your-app.lovable.app',
          })
        );

        // Verstuur email
        const { error: emailError } = await resend.emails.send({
          from: 'Tuinplanner <onboarding@resend.dev>',
          to: [user.email],
          subject: `🌱 Wekelijkse tuinagenda: ${overdueTasks.length + upcomingTasks.length} acties`,
          html,
        });

        if (emailError) {
          console.error(`Failed to send email to ${user.email}:`, emailError);
          errors++;
        } else {
          console.log(`Email sent to: ${user.email}`);
          emailsSent++;
        }
      } catch (error: any) {
        console.error(`Error processing profile ${profile.id}:`, error);
        errors++;
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      emailsSent,
      errors,
      message: `Sent ${emailsSent} emails, ${errors} errors`
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-weekly-digest:", error);
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
