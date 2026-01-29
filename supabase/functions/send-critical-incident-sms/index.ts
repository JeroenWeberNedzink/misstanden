import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const TWILIO_ACCOUNT_SID = Deno?.env?.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno?.env?.get('TWILIO_AUTH_TOKEN');
const TWILIO_PHONE_NUMBER = Deno?.env?.get('TWILIO_PHONE_NUMBER');
const supabaseUrl = Deno?.env?.get("SUPABASE_URL");
const supabaseKey = Deno?.env?.get("SUPABASE_SERVICE_ROLE_KEY");

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  throw new Error("Missing Twilio credentials: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER");
}

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req?.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  try {
    const { ticketId, eventType, phone, message, isTest } = await req?.json();

    let recipientPhone;
    let smsMessage;
    let handlerId = null;
    let ticketNumber = null;
    let severityCode = null;

    // Handle test mode
    if (isTest === true || ticketId === 'test') {
      if (!phone || !message) {
        throw new Error("For test mode, phone and message are required");
      }
      recipientPhone = phone;
      smsMessage = message;
      console.log('Test SMS mode - sending custom message');
    } else {
      // Production mode - fetch ticket details
      if (!ticketId) {
        throw new Error("ticketId is required");
      }

      // Fetch ticket details with handler information
      const { data: ticket, error: ticketError } = await supabase?.from("tickets")?.select(`
          id,
          ticket_number,
          description,
          location,
          severity_code,
          status,
          handler_id,
          handlers (name, email, phone)
        `)?.eq("id", ticketId)?.single();

      if (ticketError || !ticket) {
        throw new Error(`Failed to fetch ticket: ${ticketError?.message}`);
      }

      // Only send SMS for critical and high severity incidents
      if (!['critical', 'high']?.includes(ticket?.severity_code?.toLowerCase())) {
        console.log(`Skipping SMS for non-critical ticket ${ticket?.ticket_number} (severity: ${ticket?.severity_code})`);
        return new Response(JSON.stringify({
          success: true,
          message: "SMS not sent - severity not critical or high"
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }

      // Check if handler has phone number
      if (!ticket?.handler_id || !ticket?.handlers?.phone) {
        console.log(`No handler phone number for ticket ${ticket?.ticket_number}`);
        return new Response(JSON.stringify({
          success: true,
          message: "SMS not sent - no handler phone number"
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }

      recipientPhone = ticket.handlers.phone;
      handlerId = ticket.handler_id;
      ticketNumber = ticket.ticket_number;
      severityCode = ticket.severity_code;

      // Construct SMS message based on event type
      if (eventType === 'assignment') {
        smsMessage = `🚨 URGENT: Critical incident #${ticket?.ticket_number} assigned to you. Severity: ${ticket?.severity_code?.toUpperCase()}. Location: ${ticket?.location || 'Not specified'}. Check portal immediately.`;
      } else if (eventType === 'status_change') {
        smsMessage = `⚠️ ALERT: Critical incident #${ticket?.ticket_number} status changed to ${ticket?.status}. Severity: ${ticket?.severity_code?.toUpperCase()}. Immediate attention required.`;
      } else {
        smsMessage = `🚨 Critical incident #${ticket?.ticket_number} requires attention. Severity: ${ticket?.severity_code?.toUpperCase()}. Location: ${ticket?.location || 'Not specified'}.`;
      }
    }

    // Send SMS via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const formData = new URLSearchParams({
      To: recipientPhone,
      From: TWILIO_PHONE_NUMBER,
      Body: smsMessage
    });

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });

    const twilioData = await twilioResponse?.json();

    if (!twilioResponse?.ok) {
      console.error('Twilio API error:', twilioData);

      // Log failed notification
      await supabase?.from('notification_logs')?.insert({
        user_id: handlerId || 'system',
        event: isTest ? 'test_sms' : (eventType || 'critical_incident'),
        channel: 'sms',
        status: 'failed',
        error_message: twilioData?.message || 'Failed to send SMS',
        metadata: {
          ticket_id: ticketId,
          ticket_number: ticketNumber,
          severity: severityCode,
          phone: recipientPhone,
          test: isTest || false
        }
      });

      return new Response(JSON.stringify({
        error: 'Failed to send SMS',
        details: twilioData
      }), {
        status: twilioResponse.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    console.log('SMS sent successfully:', twilioData?.sid);

    // Log successful notification
    await supabase?.from('notification_logs')?.insert({
      user_id: handlerId || 'system',
      event: isTest ? 'test_sms' : (eventType || 'critical_incident'),
      channel: 'sms',
      status: 'success',
      metadata: {
        ticket_id: ticketId,
        ticket_number: ticketNumber,
        severity: severityCode,
        phone: recipientPhone,
        message_sid: twilioData?.sid,
        twilio_status: twilioData?.status,
        test: isTest || false
      }
    });

    return new Response(JSON.stringify({
      success: true,
      messageSid: twilioData.sid,
      status: twilioData.status,
      message: 'Critical incident SMS sent successfully'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error sending critical incident SMS:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});