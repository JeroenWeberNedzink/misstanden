import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PHP_MAIL_API_URL = Deno.env.get("PHP_MAIL_API_URL") || "http://localhost:5173/api/mail.api.php";

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "*"
      }
    });
  }

  try {
    const { ticketId, oldStatus, newStatus } = await req.json();

    if (!ticketId || !oldStatus || !newStatus) {
      throw new Error("ticketId, oldStatus, and newStatus are required");
    }

    // Fetch ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
        id,
        ticket_number,
        description,
        location,
        severity_code,
        reporter_email,
        reporter_name,
        email_notify,
        status_email_notify,
        status_code,
        workflow_type,
        handler_id,
        handlers (name, email)
      `)
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      throw new Error(`Failed to fetch ticket: ${ticketError?.message}`);
    }

    // Status messages for reporters
    const statusMessages: Record<string, string> = {
      "Nieuw": "Je melding is ontvangen en wordt binnenkort opgepakt",
      "In Behandeling": "Je melding wordt beoordeeld door ons team",
      "Onderzoek": "We zijn je melding aan het onderzoeken",
      "Actie": "Er wordt actie ondernomen op je melding",
      "Afgerond": "Je melding is opgelost",
      "Gesloten": "Je melding is afgesloten",
      "Wacht op Info": "We wachten op aanvullende informatie"
    };

    const statusMessage = statusMessages[newStatus] || `De status is gewijzigd naar ${newStatus}`;

    // Lookup status contact person (if configured)
    let statusContact = {
      name: null,
      email: null,
      phone: null,
      notes: null
    };

    if (ticket.workflow_type && ticket.status_code) {
      const { data: wf } = await supabase
        .from("workflows")
        .select("id")
        .eq("code", ticket.workflow_type)
        .single();

      if (wf?.id) {
        const { data: statusRow } = await supabase
          .from("workflow_statuses")
          .select("contact_person_name, contact_person_email, contact_person_phone, contact_notes")
          .eq("workflow_id", wf.id)
          .eq("code", ticket.status_code)
          .single();

        statusContact = {
          name: statusRow?.contact_person_name || null,
          email: statusRow?.contact_person_email || null,
          phone: statusRow?.contact_person_phone || null,
          notes: statusRow?.contact_notes || null
        };
      }
    }

    const hasContact =
      Boolean(statusContact.name || statusContact.email || statusContact.phone || statusContact.notes);

    // Email to reporter (if they opted in)
    if (ticket.email_notify && ticket.status_email_notify !== false && ticket.reporter_email) {
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
    .status-box { background: white; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .status-badge { display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; margin: 0 5px; }
    .old-status { background: #e5e7eb; color: #374151; }
    .new-status { background: #10b981; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;">🔄 Status Update</h1>
    </div>
    <div class="content">
      <p>Beste ${ticket.reporter_name || "melder"},</p>
      <h3 style="margin:15px 0 10px 0;">Ticket #${ticket.ticket_number}</h3>
      <div class="status-box">
        <p style="margin:0 0 10px 0;">De status van uw melding is gewijzigd:</p>
        <p style="margin:10px 0;">
          <span class="status-badge old-status">${oldStatus}</span> → 
          <span class="status-badge new-status">${newStatus}</span>
        </p>
        <p style="margin:10px 0 0 0;color:#374151;">${statusMessage}</p>
      </div>
      ${hasContact ? `
      <div class="status-box">
        <p style="margin:0 0 6px 0;font-weight:600;">Contactpersoon</p>
        <p style="margin:6px 0;"><strong>Naam:</strong> ${statusContact.name || "-"}</p>
        <p style="margin:6px 0;"><strong>E-mail:</strong> ${statusContact.email || "-"}</p>
        <p style="margin:6px 0;"><strong>Telefoon:</strong> ${statusContact.phone || "-"}</p>
        <p style="margin:6px 0;"><strong>Notitie:</strong> ${statusContact.notes || "-"}</p>
      </div>
      ` : ""}
      <p style="margin-top:20px;font-size:13px;color:#6b7280;">
        U kunt de voortgang van uw melding volgen met uw ticketnummer en toegangscode.
      </p>
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
      formData.append('mailto', ticket.reporter_email);
      formData.append('mailsubject', `🔄 Status update: ${ticket.ticket_number}`);
      formData.append('mailhtml', reporterEmailHtml);

      const reporterResponse = await fetch(PHP_MAIL_API_URL, {
        method: "POST",
        body: formData
      });

      if (!reporterResponse.ok) {
        const error = await reporterResponse.text();
        console.error("Failed to send reporter status email:", error);

        // Log failed email to notification_logs
        await supabase.from('notification_logs').insert({
          channel: 'email',
          status: 'failed',
          event: 'status_change_reporter',
          user_id: ticket.reporter_email || 'system',
          error_message: error || 'Failed to send email',
          metadata: {
            recipient: ticket.reporter_email,
            subject: `🔄 Status update: ${ticket.ticket_number}`,
            ticket_number: ticket.ticket_number,
            ticket_id: ticketId,
            old_status: oldStatus,
            new_status: newStatus
          }
        });
      } else {
        const result = await reporterResponse.json();
        console.log("Reporter status email sent:", result.msg);

        // Log successful email to notification_logs
        await supabase.from('notification_logs').insert({
          channel: 'email',
          status: 'success',
          event: 'status_change_reporter',
          user_id: ticket.reporter_email || 'system',
          metadata: {
            recipient: ticket.reporter_email,
            subject: `🔄 Status update: ${ticket.ticket_number}`,
            ticket_number: ticket.ticket_number,
            ticket_id: ticketId,
            old_status: oldStatus,
            new_status: newStatus,
            response: result.msg
          }
        });
      }
    }

    // Email to handler (if assigned)
    if (ticket.handler_id && ticket.handlers?.email) {
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
    .status-box { background: white; border-left: 4px solid #0ea5e9; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .status-badge { display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; margin: 0 5px; }
    .old-status { background: #e5e7eb; color: #374151; }
    .new-status { background: #10b981; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;">🔄 Status Gewijzigd</h1>
    </div>
    <div class="content">
      <p>Hallo ${ticket.handlers.name},</p>
      <h3 style="margin:15px 0 10px 0;">Ticket #${ticket.ticket_number}</h3>
      <div class="status-box">
        <p style="margin:0 0 10px 0;">De status is gewijzigd:</p>
        <p style="margin:10px 0;">
          <span class="status-badge old-status">${oldStatus}</span> → 
          <span class="status-badge new-status">${newStatus}</span>
        </p>
      </div>
      <p><strong>Locatie:</strong> ${ticket.location || "Niet opgegeven"}</p>
      <p><strong>Omschrijving:</strong> ${ticket.description}</p>
      <p style="margin-top:20px;font-size:13px;color:#6b7280;">
        Log in op het portaal om deze melding te bekijken.
      </p>
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
      handlerFormData.append('mailto', ticket.handlers.email);
      handlerFormData.append('mailsubject', `🔄 Status gewijzigd: ${ticket.ticket_number}`);
      handlerFormData.append('mailhtml', handlerEmailHtml);

      const handlerResponse = await fetch(PHP_MAIL_API_URL, {
        method: "POST",
        body: handlerFormData
      });

      if (!handlerResponse.ok) {
        const error = await handlerResponse.text();
        console.error("Failed to send handler status email:", error);

        // Log failed email to notification_logs
        await supabase.from('notification_logs').insert({
          channel: 'email',
          status: 'failed',
          event: 'status_change_handler',
          user_id: ticket.handlers.email || 'system',
          error_message: error || 'Failed to send email',
          metadata: {
            recipient: ticket.handlers.email,
            subject: `🔄 Status gewijzigd: ${ticket.ticket_number}`,
            ticket_number: ticket.ticket_number,
            ticket_id: ticketId,
            handler_id: ticket.handler_id,
            handler_name: ticket.handlers.name,
            old_status: oldStatus,
            new_status: newStatus
          }
        });
      } else {
        const result = await handlerResponse.json();
        console.log("Handler status email sent:", result.msg);

        // Log successful email to notification_logs
        await supabase.from('notification_logs').insert({
          channel: 'email',
          status: 'success',
          event: 'status_change_handler',
          user_id: ticket.handlers.email || 'system',
          metadata: {
            recipient: ticket.handlers.email,
            subject: `🔄 Status gewijzigd: ${ticket.ticket_number}`,
            ticket_number: ticket.ticket_number,
            ticket_id: ticketId,
            handler_id: ticket.handler_id,
            handler_name: ticket.handlers.name,
            old_status: oldStatus,
            new_status: newStatus,
            response: result.msg
          }
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Status change emails sent successfully"
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    console.error("Error in send-status-change-email:", error);
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
