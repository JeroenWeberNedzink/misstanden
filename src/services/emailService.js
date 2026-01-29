/**
 * Email Service
 * Provides functions to send emails using the PHP Mail API
 */

// Proxied through Vite dev server to http://localhost:8080
const PHP_MAIL_API_URL = '/api/mail.api.php';

/**
 * Send an email using the PHP Mail API
 * @param {Object} options - Email options
 * @param {string} options.from - Sender email address
 * @param {string|string[]} options.to - Recipient email address(es)
 * @param {string} [options.cc] - CC email address(es)
 * @param {string} [options.bcc] - BCC email address(es)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML email body
 * @param {string} [options.text] - Plain text email body (optional, will be auto-generated if not provided)
 * @param {boolean} [options.useTemplate=false] - Whether to wrap email in template
 * @param {boolean} [options.requestConfirmation=false] - Request read receipt
 * @param {File[]} [options.attachments] - Array of file attachments
 * @returns {Promise<Object>} Response from PHP Mail API
 */
export async function sendEmail(options) {
  const {
    from,
    to,
    cc,
    bcc,
    subject,
    html,
    text,
    useTemplate = false,
    requestConfirmation = false,
    attachments = []
  } = options;

  // Prepare FormData for PHP API
  const formData = new FormData();

  // Required fields
  formData.append('mailfrom', from);
  formData.append('mailto', Array.isArray(to) ? to.join(';') : to);
  formData.append('mailsubject', subject);
  formData.append('mailhtml', html);

  // Optional fields
  if (text) {
    formData.append('mailtext', text);
  }

  if (cc) {
    formData.append('mailcc', Array.isArray(cc) ? cc.join(';') : cc);
  }

  if (bcc) {
    formData.append('mailbcc', Array.isArray(bcc) ? bcc.join(';') : bcc);
  }

  if (useTemplate) {
    formData.append('mailtemplate', '1');
  }

  if (requestConfirmation) {
    formData.append('mailconfirm', '1');
  }

  // Add file attachments
  if (attachments && attachments.length > 0) {
    attachments.forEach((file, index) => {
      formData.append(`attachment_${index}`, file);
    });
  }

  try {
    const response = await fetch(PHP_MAIL_API_URL, {
      method: 'POST',
      body: formData
    });

    // Try to parse JSON response
    let result;
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
    } else {
      // Not JSON - probably an error message
      const text = await response.text();
      console.error('[EmailService] Non-JSON response:', text);

      throw new Error(`Mail API returned non-JSON response (status ${response.status}): ${text.substring(0, 200)}`);
    }

    if (!response.ok) {
      console.error('[EmailService] Mail API error:', result);
      throw new Error(result.message || result.msg || `Failed to send email (status ${response.status})`);
    }

    return result;
  } catch (error) {
    console.error('[EmailService] Error sending email:', error);
    throw error;
  }
}

/**
 * Send a new report confirmation email
 * @param {Object} ticket - Ticket object (in camelCase)
 * @returns {Promise<Object>}
 */
export async function sendReportConfirmationEmail(ticket) {
  const {
    reporterEmail,
    reporterName,
    ticketNumber,
    description,
    location,
    severityLabel,
    submittedAt,
    emailNotify
  } = ticket;

  // Only send if user opted in
  if (!emailNotify || !reporterEmail) {
    console.log('[EmailService] Skipping reporter confirmation:', { emailNotify, reporterEmail });
    return { success: false, message: 'Reporter did not opt-in for email notifications' };
  }

  const html = `
<style>
  .info-box { background: #f9fafb; border-left: 4px solid #10b981; padding: 15px; margin: 15px 0; border-radius: 4px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; background: #f59e0b; color: white; }
  h2 { color: #1f2937; margin: 0 0 10px 0; }
</style>
<h2>✅ Melding Ontvangen</h2>
<p>Beste ${reporterName || 'melder'},</p>
<p>Bedankt voor uw melding. We hebben deze in goede orde ontvangen en nemen deze in behandeling.</p>
<div class="info-box">
  <h3 style="margin:0 0 10px 0;">Ticket #${ticketNumber}</h3>
  <p><strong>Locatie:</strong> ${location || 'Niet opgegeven'}</p>
  <p><strong>Ernst:</strong> <span class="badge">${severityLabel || 'Medium'}</span></p>
  <p><strong>Omschrijving:</strong></p>
  <p>${description}</p>
  <p><strong>Ingediend op:</strong> ${new Date(submittedAt).toLocaleString('nl-NL')}</p>
</div>
<p>U kunt de status van uw melding volgen met uw ticketnummer en toegangscode.</p>
<p style="margin-top:20px;font-size:13px;color:#6b7280;">U ontvangt automatisch updates wanneer de status van uw melding wijzigt.</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    to: reporterEmail,
    subject: `Melding ontvangen: ${ticketNumber}`,
    html,
    useTemplate: true
  });
  return { success: true, result };
}

/**
 * Send a handler notification email for new assignment
 * @param {Object} ticket - Ticket object
 * @param {Object} handler - Handler object
 * @returns {Promise<Object>}
 */
export async function sendHandlerAssignmentEmail(ticket, handler) {
  const {
    ticketNumber,
    description,
    location,
    severityLabel,
    reporterEmail,
    submittedAt
  } = ticket;

  const html = `
<style>
  .info-box { background: #f9fafb; border-left: 4px solid #0ea5e9; padding: 15px; margin: 15px 0; border-radius: 4px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; background: #f59e0b; color: white; }
  h2 { color: #1f2937; margin: 0 0 10px 0; }
</style>
<h2>🎫 Nieuwe Melding Toegewezen</h2>
<p>Hallo ${handler.name},</p>
<p>Er is een nieuwe melding binnengekomen die aan jou is toegewezen.</p>
<div class="info-box">
  <h3 style="margin:0 0 10px 0;">Ticket #${ticketNumber}</h3>
  <p><strong>Locatie:</strong> ${location || 'Niet opgegeven'}</p>
  <p><strong>Ernst:</strong> <span class="badge">${severityLabel || 'Medium'}</span></p>
  <p><strong>Omschrijving:</strong></p>
  <p>${description}</p>
  <p><strong>Ingediend door:</strong> ${reporterEmail || 'Anoniem'}</p>
  <p><strong>Ingediend op:</strong> ${new Date(submittedAt).toLocaleString('nl-NL')}</p>
</div>
<p style="margin-top:20px;font-size:13px;color:#6b7280;">Log in op het portaal om deze melding te bekijken en actie te ondernemen.</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    to: handler.email,
    subject: `Nieuwe melding toegewezen: ${ticketNumber}`,
    html,
    useTemplate: true
  });
  return { success: true, result };
}

/**
 * Send a status change notification email
 * @param {Object} ticket - Ticket object
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 * @returns {Promise<Object>}
 */
export async function sendStatusChangeEmail(ticket, oldStatus, newStatus) {
  const {
    reporterEmail,
    reporterName,
    ticketNumber,
    description,
    location,
    emailNotify
  } = ticket;

  // Only send if user opted in
  if (!emailNotify || !reporterEmail) {
    return { success: false, message: 'Reporter did not opt-in for email notifications' };
  }

  const statusMessages = {
    'Nieuw': 'Je melding is ontvangen en wordt binnenkort opgepakt',
    'In Behandeling': 'Je melding wordt beoordeeld door ons team',
    'Onderzoek': 'We zijn je melding aan het onderzoeken',
    'Actie': 'Er wordt actie ondernomen op je melding',
    'Afgerond': 'Je melding is opgelost',
    'Gesloten': 'Je melding is afgesloten',
    'Wacht op Info': 'We wachten op aanvullende informatie'
  };

  const statusMessage = statusMessages[newStatus] || `De status is gewijzigd naar ${newStatus}`;

  const html = `
<style>
  .status-box { background: #f9fafb; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; border-radius: 4px; }
  .status-badge { display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; margin: 0 5px; }
  .old-status { background: #e5e7eb; color: #374151; }
  .new-status { background: #10b981; color: white; }
  h2 { color: #1f2937; margin: 0 0 10px 0; }
</style>
<h2>🔄 Status Update</h2>
<p>Beste ${reporterName || 'melder'},</p>
<h3 style="margin:15px 0 10px 0;">Ticket #${ticketNumber}</h3>
<div class="status-box">
  <p style="margin:0 0 10px 0;">De status van uw melding is gewijzigd:</p>
  <p style="margin:10px 0;">
    <span class="status-badge old-status">${oldStatus}</span> →
    <span class="status-badge new-status">${newStatus}</span>
  </p>
  <p style="margin:10px 0 0 0;color:#374151;">${statusMessage}</p>
</div>
<p style="margin-top:20px;font-size:13px;color:#6b7280;">
  U kunt de voortgang van uw melding volgen met uw ticketnummer en toegangscode.
</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    to: reporterEmail,
    subject: `Status update: ${ticketNumber}`,
    html,
    useTemplate: true
  });
  return { success: true, result };
}

/**
 * Send handler status change notification
 * @param {Object} ticket - Ticket object
 * @param {Object} handler - Handler object
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 * @returns {Promise<Object>}
 */
export async function sendHandlerStatusChangeEmail(ticket, handler, oldStatus, newStatus) {
  const { ticketNumber, description, location } = ticket;

  const html = `
<style>
  .status-box { background: #f9fafb; border-left: 4px solid #0ea5e9; padding: 15px; margin: 15px 0; border-radius: 4px; }
  .status-badge { display: inline-block; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; margin: 0 5px; }
  .old-status { background: #e5e7eb; color: #374151; }
  .new-status { background: #10b981; color: white; }
  h2 { color: #1f2937; margin: 0 0 10px 0; }
</style>
<h2>🔄 Status Gewijzigd</h2>
<p>Hallo ${handler.name},</p>
<h3 style="margin:15px 0 10px 0;">Ticket #${ticketNumber}</h3>
<div class="status-box">
  <p style="margin:0 0 10px 0;">De status is gewijzigd:</p>
  <p style="margin:10px 0;">
    <span class="status-badge old-status">${oldStatus}</span> →
    <span class="status-badge new-status">${newStatus}</span>
  </p>
</div>
<p><strong>Locatie:</strong> ${location || 'Niet opgegeven'}</p>
<p><strong>Omschrijving:</strong> ${description}</p>
<p style="margin-top:20px;font-size:13px;color:#6b7280;">
  Log in op het portaal om deze melding te bekijken.
</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    to: handler.email,
    subject: `Status gewijzigd: ${ticketNumber}`,
    html,
    useTemplate: true
  });
  return { success: true, result };
}

export default {
  sendEmail,
  sendReportConfirmationEmail,
  sendHandlerAssignmentEmail,
  sendStatusChangeEmail,
  sendHandlerStatusChangeEmail
};
