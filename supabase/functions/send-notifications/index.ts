// supabase/functions/send-notifications/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // service key nodig
);

type Prefs = {
  remind_sow?: boolean;
  remind_plant?: boolean;
  remind_harvest?: boolean;
};

Deno.serve(async (_req) => {
  const today = new Date();
  const upcoming = new Date(today);
  upcoming.setDate(today.getDate() + 2); // check komende 2 dagen

  // 1. Haal taken op
  const { data: tasks, error: tErr } = await supabase
    .from("tasks")
    .select("id, type, due_date, garden_id")
    .gte("due_date", today.toISOString().slice(0, 10))
    .lte("due_date", upcoming.toISOString().slice(0, 10))
    .eq("status", "pending");

  if (tErr) {
    console.error("Error tasks", tErr);
    return new Response("Error tasks", { status: 500 });
  }

  if (!tasks || tasks.length === 0) {
    return new Response("Geen taken vandaag", { status: 200 });
  }

  // 2. Voor elke garden → vind leden en hun prefs
  for (const task of tasks) {
    const { data: users } = await supabase
      .from("garden_users")
      .select("user_id, profiles(notification_prefs, display_name)")
      .eq("garden_id", task.garden_id)
      .maybeSingle();

    if (!users) continue;

    for (const u of Array.isArray(users) ? users : [users]) {
      const prefs: Prefs = u.profiles?.notification_prefs || {};
      const shouldNotify =
        (task.type === "sow" && prefs.remind_sow) ||
        (task.type === "plant_out" && prefs.remind_plant) ||
        ((task.type === "harvest_start" || task.type === "harvest_end") &&
          prefs.remind_harvest);

      if (shouldNotify) {
        // 3. Stuur mail
        await sendEmail(u.user_id, task);
      }
    }
  }

  return new Response("Notificaties verstuurd", { status: 200 });
});

async function sendEmail(userId: string, task: any) {
  // Haal email van user
  const { data: user } = await supabase.auth.admin.getUserById(userId);
  if (!user) return;

  const email = user.user.email;
  const subject = `Herinnering: ${task.type} gepland`;
  const body = `Beste tuinier,

Je hebt binnenkort een taak: ${task.type} op ${task.due_date}.

Succes met de moestuin! 🌱`;

  // Supabase Mailer (SMTP) gebruiken
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Bosgoedt <no-reply@bosgoedt.be>",
      to: email,
      subject,
      text: body,
    }),
  });

  console.log("Send email result:", await res.text());
}
