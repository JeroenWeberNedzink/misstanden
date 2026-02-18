import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const supabaseUrl = Deno?.env?.get("SUPABASE_URL");
const supabaseKey = Deno?.env?.get("SUPABASE_SERVICE_ROLE_KEY");
const PHP_MAIL_API_URL = Deno?.env?.get("PHP_MAIL_API_URL") || "http://localhost:5173/api/mail.api.php";

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

const toPositiveNumber = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

const addDays = (base: Date, days: number): Date => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

const formatDateTimeNL = (value: Date | string | null): string => {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

serve(async (req) => {
  // ✅ CORS preflight
  if (req?.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "*"
      }
    });
  }

  try {
    const { ticketId } = await req?.json();

    if (!ticketId) {
      throw new Error("ticketId is required");
    }

    // Fetch ticket details
    const { data: ticket, error: ticketError } = await supabase?.from("tickets")?.select(`
        id,
        ticket_number,
        description,
        location,
        severity_code,
        reporter_email,
        reporter_name,
        email_notify,
        submitted_at,
        status_code,
        workflow_type,
        handler_id,
        handlers (name, email)
      `)?.eq("id", ticketId)?.single();

    if (ticketError || !ticket) {
      throw new Error(`Failed to fetch ticket: ${ticketError?.message}`);
    }

    // Fetch severity label
    const { data: severity } = await supabase?.from("incident_severities")?.select("label")?.eq("code", ticket?.severity_code)?.single();

    const severityLabel = severity?.label || ticket?.severity_code || "Medium";
    let currentStepLabel = ticket?.status_code || "Ontvangen";
    let nextStepLabel = null;
    let expectedNextUpdateText = "Binnenkort";

    if (ticket?.workflow_type) {
      const { data: wf } = await supabase
        .from("workflows")
        .select("id")
        .eq("code", ticket.workflow_type)
        .single();

      if (wf?.id) {
        const { data: statusRows } = await supabase
          .from("workflow_statuses")
          .select("code, label, sort_order, expected_duration_days")
          .eq("workflow_id", wf.id)
          .order("sort_order", { ascending: true });

        const rows = Array.isArray(statusRows) ? statusRows : [];
        if (rows.length > 0) {
          const statusCode = normalize(ticket?.status_code);
          const currentStatus = rows.find((s) => normalize(s?.code) === statusCode) || rows[0];

          if (currentStatus) {
            currentStepLabel = currentStatus?.label || currentStatus?.code || currentStepLabel;
            const currentIndex = rows.findIndex((s) => s?.code === currentStatus.code);
            const nextStatus = currentIndex >= 0 ? rows[currentIndex + 1] : null;
            if (nextStatus) {
              nextStepLabel = nextStatus?.label || nextStatus?.code || null;
            }

            const expectedDays = toPositiveNumber(currentStatus.expected_duration_days);
            if (expectedDays !== null) {
              const dueAt = addDays(new Date(), expectedDays);
              expectedNextUpdateText = `Binnen ${expectedDays} dag(en), rond ${formatDateTimeNL(dueAt)}`;
            }
          }
        }
      }
    }

    // Email to reporter (if they opted in)
    if (ticket?.email_notify && ticket?.reporter_email) {
      const reporterEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0ea5e9; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .footer { background: #374151; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
    .info-box { background: white; border-left: 4px solid #10b981; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; background: #f59e0b; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;">✅ Melding Ontvangen</h1>
    </div>
    <div class="content">
      <p>Beste ${ticket?.reporter_name || "melder"},</p>
      <p>Bedankt voor uw melding. We hebben deze in goede orde ontvangen en nemen deze in behandeling.</p>
      <div class="info-box">
        <h2 style="margin:0 0 10px 0;">Ticket #${ticket?.ticket_number}</h2>
        <p><strong>Locatie:</strong> ${ticket?.location || "Niet opgegeven"}</p>
        <p><strong>Ernst:</strong> <span class="badge">${severityLabel}</span></p>
        <p><strong>Omschrijving:</strong></p>
        <p>${ticket?.description}</p>
        <p><strong>Ingediend op:</strong> ${new Date(ticket.submitted_at)?.toLocaleString("nl-NL")}</p>
      </div>
      <div class="info-box">
        <p style="margin:0 0 8px 0;font-weight:600;">Volgende stap in het proces (SLA)</p>
        <p style="margin:6px 0;"><strong>Huidige stap:</strong> ${currentStepLabel}</p>
        <p style="margin:6px 0;"><strong>Volgende stap:</strong> ${nextStepLabel || "Eindfase / afronding"}</p>
        <p style="margin:6px 0;"><strong>Verwachte volgende update:</strong> ${expectedNextUpdateText}</p>
      </div>
      <p>U kunt de status van uw melding volgen met uw ticketnummer en toegangscode.</p>
      <p style="margin-top:20px;font-size:13px;color:#6b7280;">U ontvangt automatisch updates wanneer de status van uw melding wijzigt.</p>
    </div>
    <div class="footer">
      <p>NedZink Incident Portal | Dit is een automatisch gegenereerd bericht</p>
    </div>
  </div>
</body>
</html>`;

      // Send email to reporter via PHP Mail API
      const formData = new FormData();
      formData.append('mailfrom', 'noreply@nedzink.nl');
      formData.append('mailto', ticket?.reporter_email);
      formData.append('mailsubject', `✅ Melding ontvangen: ${ticket?.ticket_number}`);
      formData.append('mailhtml', reporterEmailHtml);

      const reporterResponse = await fetch(PHP_MAIL_API_URL, {
        method: "POST",
        body: formData
      });

      if (!reporterResponse?.ok) {
        const error = await reporterResponse?.text();
        console.error("Failed to send reporter email:", error);

        // Log failed email to notification_logs
        await supabase.from('notification_logs').insert({
          channel: 'email',
          status: 'failed',
          event: 'report_submission_reporter',
          user_id: ticket?.reporter_email || 'system',
          error_message: error || 'Failed to send email',
          metadata: {
            recipient: ticket?.reporter_email,
            subject: `✅ Melding ontvangen: ${ticket?.ticket_number}`,
            ticket_number: ticket?.ticket_number,
            ticket_id: ticketId
          }
        });
      } else {
        const result = await reporterResponse?.json();
        console.log("Reporter email sent:", result.msg);

        // Log successful email to notification_logs
        await supabase.from('notification_logs').insert({
          channel: 'email',
          status: 'success',
          event: 'report_submission_reporter',
          user_id: ticket?.reporter_email || 'system',
          metadata: {
            recipient: ticket?.reporter_email,
            subject: `✅ Melding ontvangen: ${ticket?.ticket_number}`,
            ticket_number: ticket?.ticket_number,
            ticket_id: ticketId,
            response: result.msg
          }
        });
      }
    }

    // Email to handler (if assigned)
    if (ticket?.handler_id && ticket?.handlers?.email) {
      const handlerEmailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0ea5e9; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .footer { background: #374151; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
    .info-box { background: white; border-left: 4px solid #0ea5e9; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; background: #f59e0b; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;">🎫 Nieuwe Melding</h1>
    </div>
    <div class="content">
      <p>Hallo ${ticket?.handlers?.name},</p>
      <p>Er is een nieuwe melding binnengekomen die aan jou is toegewezen.</p>
      <div class="info-box">
        <h2 style="margin:0 0 10px 0;">Ticket #${ticket?.ticket_number}</h2>
        <p><strong>Locatie:</strong> ${ticket?.location || "Niet opgegeven"}</p>
        <p><strong>Ernst:</strong> <span class="badge">${severityLabel}</span></p>
        <p><strong>Omschrijving:</strong></p>
        <p>${ticket?.description}</p>
        <p><strong>Ingediend door:</strong> ${ticket?.reporter_email || "Anoniem"}</p>
        <p><strong>Ingediend op:</strong> ${new Date(ticket.submitted_at)?.toLocaleString("nl-NL")}</p>
      </div>
      <p style="margin-top:20px;font-size:13px;color:#6b7280;">Log in op het portaal om deze melding te bekijken en actie te ondernemen.</p>
    </div>
    <div class="footer">
      <p>NedZink Incident Portal | Dit is een automatisch gegenereerd bericht</p>
    </div>
  </div>
</body>
</html>`;

      // Send email to handler via PHP Mail API
      const handlerFormData = new FormData();
      handlerFormData.append('mailfrom', 'noreply@nedzink.nl');
      handlerFormData.append('mailto', ticket?.handlers?.email);
      handlerFormData.append('mailsubject', `🎫 Nieuwe melding toegewezen: ${ticket?.ticket_number}`);
      handlerFormData.append('mailhtml', handlerEmailHtml);

      const handlerResponse = await fetch(PHP_MAIL_API_URL, {
        method: "POST",
        body: handlerFormData
      });

      if (!handlerResponse?.ok) {
        const error = await handlerResponse?.text();
        console.error("Failed to send handler email:", error);

        // Log failed email to notification_logs
        await supabase.from('notification_logs').insert({
          channel: 'email',
          status: 'failed',
          event: 'handler_assignment',
          user_id: ticket?.handlers?.email || 'system',
          error_message: error || 'Failed to send email',
          metadata: {
            recipient: ticket?.handlers?.email,
            subject: `🎫 Nieuwe melding toegewezen: ${ticket?.ticket_number}`,
            ticket_number: ticket?.ticket_number,
            ticket_id: ticketId,
            handler_id: ticket?.handler_id,
            handler_name: ticket?.handlers?.name
          }
        });
      } else {
        const result = await handlerResponse?.json();
        console.log("Handler email sent:", result.msg);

        // Log successful email to notification_logs
        await supabase.from('notification_logs').insert({
          channel: 'email',
          status: 'success',
          event: 'handler_assignment',
          user_id: ticket?.handlers?.email || 'system',
          metadata: {
            recipient: ticket?.handlers?.email,
            subject: `🎫 Nieuwe melding toegewezen: ${ticket?.ticket_number}`,
            ticket_number: ticket?.ticket_number,
            ticket_id: ticketId,
            handler_id: ticket?.handler_id,
            handler_name: ticket?.handlers?.name,
            response: result.msg
          }
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Report submission emails sent successfully"
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    console.error("Error in send-report-email:", error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
});
