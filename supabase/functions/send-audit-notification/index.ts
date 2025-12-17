import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AuditNotificationRequest {
  requesterName: string;
  deadline: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-audit-notification function called");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { requesterName, deadline }: AuditNotificationRequest = await req.json();
    console.log("Received audit notification request:", { requesterName, deadline });

    const deadlineDate = new Date(deadline);
    const formattedDeadline = deadlineDate.toLocaleDateString("nl-NL", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const emailResponse = await resend.emails.send({
      from: "moestuin@bosgoedt.be",
      to: ["ph.g.marquet@gmail.com"],
      subject: "🔍 Nieuwe audit aangevraagd",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8f9fa; margin: 0; padding: 20px;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            <h1 style="font-size: 20px; font-weight: 600; color: #1a1a1a; margin: 0 0 24px 0;">
              🔍 Nieuwe audit aangevraagd
            </h1>
            
            <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 16px 0;">
              <strong>${requesterName}</strong> heeft een audit aangevraagd voor de moestuin.
            </p>
            
            <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 24px 0;">
              <p style="font-size: 14px; color: #6b7280; margin: 0 0 4px 0;">Deadline:</p>
              <p style="font-size: 16px; font-weight: 600; color: #1a1a1a; margin: 0;">
                ${formattedDeadline}
              </p>
            </div>
            
            <p style="font-size: 14px; color: #6b7280; line-height: 1.5; margin: 24px 0 0 0;">
              Log in op de Bosgoedt Planner om de audit te bekijken en af te handelen.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-audit-notification function:", error);
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
