/**
 * Email Service
 * Provides functions to send emails using the PHP Mail API
 */

// Proxied through Vite dev server to http://localhost:8080
const PHP_MAIL_API_URL = '/api/mail.api.php';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const nl2br = (value) => escapeHtml(value).replace(/\n/g, '<br/>');

const formatDateNL = (value) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('nl-NL');
  } catch {
    return '-';
  }
};

const formatFileSize = (bytes) => {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const severityLabelFromCode = (code) => {
  const c = String(code ?? '').toLowerCase();
  if (c === 'critical') return 'Kritiek';
  if (c === 'high') return 'Hoog';
  if (c === 'medium') return 'Middel';
  if (c === 'low') return 'Laag';
  return code ? String(code) : '-';
};

const severityClassFromCode = (code) => {
  const c = String(code ?? '').toLowerCase();
  if (c === 'critical') return 'badge-critical';
  if (c === 'high') return 'badge-high';
  if (c === 'medium') return 'badge-medium';
  if (c === 'low') return 'badge-low';
  return 'badge-neutral';
};

const getReporterEmailTarget = (ticket) => {
  if (ticket?.reporterEmail) return { to: ticket.reporterEmail };
  if (ticket?.reporterEmailEncrypted) return { toEncrypted: ticket.reporterEmailEncrypted };
  return null;
};

const getStatusLabel = (ticket) =>
  ticket?.metadata?.statusLabel ||
  ticket?.statusLabel ||
  ticket?.status ||
  ticket?.statusCode ||
  '-';

const buildMetaTable = (rows) => `
  <table class="meta-table" role="presentation">
    ${rows
      .map(
        ([label, value]) => `
      <tr>
        <td class="meta-label">${escapeHtml(label)}</td>
        <td class="meta-value">${value || '-'}</td>
      </tr>`
      )
      .join('')}
  </table>
`;

const baseStyles = `
<style>
  .section-title { margin: 0 0 8px 0; font-size: 16px; color: #0f172a; }
  .lead { margin: 0 0 12px 0; font-size: 15px; color: #1f2937; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 12px 0; }
  .meta-table { width: 100%; border-collapse: collapse; }
  .meta-table td { padding: 6px 0; font-size: 14px; vertical-align: top; }
  .meta-label { width: 140px; color: #64748b; }
  .meta-value { color: #0f172a; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .badge-critical { background: #fee2e2; color: #b91c1c; }
  .badge-high { background: #ffedd5; color: #c2410c; }
  .badge-medium { background: #fef9c3; color: #a16207; }
  .badge-low { background: #dcfce7; color: #15803d; }
  .badge-neutral { background: #e2e8f0; color: #334155; }
  .callout { background: #ecfeff; border-left: 4px solid #0ea5e9; padding: 12px; border-radius: 8px; margin: 12px 0; }
  .callout strong { color: #0f172a; }
  .muted { color: #64748b; font-size: 13px; }
  .list { margin: 8px 0 0 0; padding: 0 0 0 18px; }
</style>
`;

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
    toEncrypted,
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
  if (toEncrypted) {
    formData.append('to_encrypted', toEncrypted);
  } else {
    formData.append('mailto', Array.isArray(to) ? to.join(';') : to);
  }
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
    reporterEmailEncrypted,
    reporterName,
    ticketNumber,
    description,
    location,
    severityLabel,
    submittedAt,
    emailNotify,
    accessCode,
    severityCode,
    workflowType,
    metadata
  } = ticket;

  // Only send if user opted in
  const reporterTarget = getReporterEmailTarget({ reporterEmail, reporterEmailEncrypted });
  if (!emailNotify || !reporterTarget) {
    console.log('[EmailService] Skipping reporter confirmation:', { emailNotify, reporterEmail, reporterEmailEncrypted });
    return { success: false, message: 'Reporter did not opt-in for email notifications' };
  }

  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode);
  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });

  const html = `
${baseStyles}
<h2 class="section-title">Bevestiging van uw melding</h2>
<p class="lead">Beste ${escapeHtml(reporterName || 'melder')},</p>
<p class="lead">Bedankt voor uw melding. We hebben deze ontvangen en nemen deze in behandeling.</p>

<div class="card">
  <h3 class="section-title">Kerngegevens</h3>
  ${buildMetaTable([
    ['Ticketnummer', escapeHtml(ticketNumber || '-')],
    ['Status', escapeHtml(statusLabel)],
    ['Ernst', `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    ['Workflow', escapeHtml(workflowType || '-')],
    ['Locatie', escapeHtml(location || 'Niet opgegeven')],
    ['Ingediend op', escapeHtml(formatDateNL(submittedAt))]
  ])}
  <div class="section-title" style="margin-top:12px;">Omschrijving</div>
  <div>${nl2br(description || '-')}</div>
</div>

${accessCode ? `
<div class="callout">
  <strong>Toegangscode:</strong> ${escapeHtml(accessCode)}<br/>
  Bewaar deze code om de status van uw melding te volgen.
</div>
` : ''}

<div class="card">
  <h3 class="section-title">Wat gebeurt er nu</h3>
  <ul class="list">
    <li>We beoordelen uw melding en koppelen deze aan de juiste workflow.</li>
    <li>U ontvangt updates bij belangrijke statuswijzigingen.</li>
    <li>Gebruik uw ticketnummer en toegangscode om de voortgang te volgen.</li>
  </ul>
</div>

<p class="muted">Deze melding is geregistreerd op ${escapeHtml(formatDateNL(submittedAt))}.</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    ...reporterTarget,
    subject: `Bevestiging melding: ${ticketNumber}`,
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
    reporterName,
    reporterPhone,
    submittedAt,
    severityCode,
    workflowType,
    metadata
  } = ticket;

  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode);
  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });

  const html = `
${baseStyles}
<h2 class="section-title">Nieuwe melding toegewezen</h2>
<p class="lead">Hallo ${escapeHtml(handler.name || 'collega')},</p>
<p class="lead">Er is een nieuwe melding aan jou toegewezen. Hieronder de kerninformatie.</p>

<div class="card">
  <h3 class="section-title">Kerngegevens</h3>
  ${buildMetaTable([
    ['Ticketnummer', escapeHtml(ticketNumber || '-')],
    ['Status', escapeHtml(statusLabel)],
    ['Ernst', `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    ['Workflow', escapeHtml(workflowType || '-')],
    ['Locatie', escapeHtml(location || 'Niet opgegeven')],
    ['Ingediend op', escapeHtml(formatDateNL(submittedAt))]
  ])}
  <div class="section-title" style="margin-top:12px;">Omschrijving</div>
  <div>${nl2br(description || '-')}</div>
</div>

<div class="card">
  <h3 class="section-title">Melder (indien bekend)</h3>
  ${buildMetaTable([
    ['Naam', escapeHtml(reporterName || 'Anoniem')],
    ['E-mail', escapeHtml(reporterEmail || 'Niet opgegeven')],
    ['Telefoon', escapeHtml(reporterPhone || 'Niet opgegeven')]
  ])}
</div>

<p class="muted">Log in op het portaal om de melding op te pakken en de status bij te werken.</p>
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
    reporterEmailEncrypted,
    reporterName,
    ticketNumber,
    description,
    location,
    emailNotify,
    statusEmailNotify,
    accessCode,
    severityCode,
    severityLabel,
    workflowType,
    submittedAt,
    metadata
  } = ticket;

  // Only send if user opted in
  const reporterTarget = getReporterEmailTarget({ reporterEmail, reporterEmailEncrypted });
  const allowStatusEmail = statusEmailNotify ?? true;
  if (!emailNotify || !allowStatusEmail || !reporterTarget) {
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
  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode);
  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });
  const contactName =
    metadata?.status_contact_person_name || metadata?.statusContactPersonName || null;
  const contactEmail =
    metadata?.status_contact_person_email || metadata?.statusContactPersonEmail || null;
  const contactPhone =
    metadata?.status_contact_person_phone || metadata?.statusContactPersonPhone || null;
  const contactNotes =
    metadata?.status_contact_notes || metadata?.statusContactNotes || null;
  const hasContact = Boolean(contactName || contactEmail || contactPhone || contactNotes);

  const html = `
${baseStyles}
<h2 class="section-title">Statusupdate van uw melding</h2>
<p class="lead">Beste ${escapeHtml(reporterName || 'melder')},</p>
<p class="lead">De status van uw melding is gewijzigd.</p>

<div class="card">
  <h3 class="section-title">Statuswijziging</h3>
  <p style="margin:6px 0;">
    <span class="badge badge-neutral">${escapeHtml(oldStatus || '-')}</span>
    →
    <span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(newStatus || '-')}</span>
  </p>
  <p class="muted">${escapeHtml(statusMessage)}</p>
</div>

<div class="card">
  <h3 class="section-title">Meldingsoverzicht</h3>
  ${buildMetaTable([
    ['Ticketnummer', escapeHtml(ticketNumber || '-')],
    ['Huidige status', escapeHtml(statusLabel)],
    ['Ernst', `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    ['Workflow', escapeHtml(workflowType || '-')],
    ['Locatie', escapeHtml(location || 'Niet opgegeven')],
    ['Ingediend op', escapeHtml(formatDateNL(submittedAt))]
  ])}
  <div class="section-title" style="margin-top:12px;">Omschrijving</div>
  <div>${nl2br(description || '-')}</div>
</div>

${hasContact ? `
<div class="card">
  <h3 class="section-title">Contactpersoon</h3>
  ${buildMetaTable([
    ['Naam', escapeHtml(contactName || '-')],
    ['E-mail', escapeHtml(contactEmail || '-')],
    ['Telefoon', escapeHtml(contactPhone || '-')],
    ['Notitie', escapeHtml(contactNotes || '-')]
  ])}
</div>
` : ''}

${accessCode ? `
<div class="callout">
  <strong>Toegangscode:</strong> ${escapeHtml(accessCode)}<br/>
  Gebruik deze code om de voortgang te volgen.
</div>
` : ''}

<p class="muted">U ontvangt automatisch updates bij belangrijke wijzigingen.</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    ...reporterTarget,
    subject: `Statusupdate: ${ticketNumber}`,
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
  const {
    ticketNumber,
    description,
    location,
    severityCode,
    severityLabel,
    workflowType,
    submittedAt,
    metadata
  } = ticket;

  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode);
  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });

  const html = `
${baseStyles}
<h2 class="section-title">Status gewijzigd</h2>
<p class="lead">Hallo ${escapeHtml(handler.name || 'collega')},</p>
<p class="lead">De status van een toegewezen melding is aangepast.</p>

<div class="card">
  <h3 class="section-title">Statuswijziging</h3>
  <p style="margin:6px 0;">
    <span class="badge badge-neutral">${escapeHtml(oldStatus || '-')}</span>
    →
    <span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(newStatus || '-')}</span>
  </p>
</div>

<div class="card">
  <h3 class="section-title">Meldingsoverzicht</h3>
  ${buildMetaTable([
    ['Ticketnummer', escapeHtml(ticketNumber || '-')],
    ['Huidige status', escapeHtml(statusLabel)],
    ['Ernst', `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    ['Workflow', escapeHtml(workflowType || '-')],
    ['Locatie', escapeHtml(location || 'Niet opgegeven')],
    ['Ingediend op', escapeHtml(formatDateNL(submittedAt))]
  ])}
  <div class="section-title" style="margin-top:12px;">Omschrijving</div>
  <div>${nl2br(description || '-')}</div>
</div>

<p class="muted">Log in op het portaal om de melding te bekijken en vervolgacties uit te voeren.</p>
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

/**
 * Send attachment added notification to reporter (public attachments only)
 * @param {Object} ticket - Ticket object
 * @param {Object} attachment - Attachment object
 * @param {string} uploaderName - Name of uploader
 * @returns {Promise<Object>}
 */
export async function sendAttachmentAddedEmail(ticket, attachment, uploaderName) {
  const {
    reporterEmail,
    reporterEmailEncrypted,
    reporterName,
    ticketNumber,
    location,
    emailNotify,
    severityCode,
    severityLabel,
    workflowType,
    submittedAt,
    metadata
  } = ticket;

  const reporterTarget = getReporterEmailTarget({ reporterEmail, reporterEmailEncrypted });
  if (!emailNotify || !reporterTarget) {
    return { success: false, message: 'Reporter did not opt-in for email notifications' };
  }

  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });
  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode);
  const fileName = attachment?.fileName || attachment?.name || '-';
  const fileType = attachment?.mimeType || attachment?.type || '-';
  const fileSize = formatFileSize(attachment?.sizeBytes || attachment?.size || 0);
  const fileUrl = attachment?.fileUrl || attachment?.url || '';

  const html = `
${baseStyles}
<h2 class="section-title">Nieuwe bijlage toegevoegd</h2>
<p class="lead">Beste ${escapeHtml(reporterName || 'melder')},</p>
<p class="lead">Er is een nieuwe bijlage toegevoegd aan uw melding.</p>

<div class="card">
  <h3 class="section-title">Bijlage</h3>
  ${buildMetaTable([
    ['Bestandsnaam', escapeHtml(fileName)],
    ['Type', escapeHtml(fileType)],
    ['Grootte', escapeHtml(fileSize)],
    ['Toegevoegd door', escapeHtml(uploaderName || 'Handler')],
    ['Toegevoegd op', escapeHtml(formatDateNL(attachment?.createdAt || attachment?.created_at))]
  ])}
  ${fileUrl ? `<p><a href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer">Download bijlage</a></p>` : ''}
</div>

<div class="card">
  <h3 class="section-title">Meldingsoverzicht</h3>
  ${buildMetaTable([
    ['Ticketnummer', escapeHtml(ticketNumber || '-')],
    ['Huidige status', escapeHtml(statusLabel)],
    ['Ernst', `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    ['Workflow', escapeHtml(workflowType || '-')],
    ['Locatie', escapeHtml(location || 'Niet opgegeven')],
    ['Ingediend op', escapeHtml(formatDateNL(submittedAt))]
  ])}
</div>

<p class="muted">Log in op het portaal om alle bijlagen te bekijken.</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    ...reporterTarget,
    subject: `Nieuwe bijlage: ${ticketNumber || ''}`,
    html,
    useTemplate: true
  });
  return { success: true, result };
}

/**
 * Send message notification to reporter
 * @param {Object} ticket - Ticket object
 * @param {string} senderName - Name of sender
 * @param {string} body - Message body
 * @returns {Promise<Object>}
 */
export async function sendReporterMessageEmail(ticket, senderName, body) {
  const {
    reporterEmail,
    reporterEmailEncrypted,
    reporterName,
    ticketNumber,
    location,
    emailNotify,
    severityCode,
    severityLabel,
    workflowType,
    submittedAt,
    metadata
  } = ticket;

  const reporterTarget = getReporterEmailTarget({ reporterEmail, reporterEmailEncrypted });
  if (!emailNotify || !reporterTarget) {
    return { success: false, message: 'Reporter did not opt-in for email notifications' };
  }

  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });
  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode);

  const html = `
${baseStyles}
<h2 class="section-title">Nieuw bericht</h2>
<p class="lead">Beste ${escapeHtml(reporterName || 'melder')},</p>
<p class="lead">U heeft een nieuw bericht ontvangen in het communicatieportaal.</p>

<div class="card">
  <h3 class="section-title">Bericht</h3>
  <p><strong>Van:</strong> ${escapeHtml(senderName || 'Behandelaar')}</p>
  <div>${nl2br(body || '-')}</div>
</div>

<div class="card">
  <h3 class="section-title">Meldingsoverzicht</h3>
  ${buildMetaTable([
    ['Ticketnummer', escapeHtml(ticketNumber || '-')],
    ['Huidige status', escapeHtml(statusLabel)],
    ['Ernst', `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    ['Workflow', escapeHtml(workflowType || '-')],
    ['Locatie', escapeHtml(location || 'Niet opgegeven')],
    ['Ingediend op', escapeHtml(formatDateNL(submittedAt))]
  ])}
</div>

<p class="muted">Log in op het portaal om te reageren.</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    ...reporterTarget,
    subject: `Nieuw bericht: ${ticketNumber || ''}`,
    html,
    useTemplate: true
  });
  return { success: true, result };
}

/**
 * Send message notification to handler
 * @param {Object} ticket - Ticket object
 * @param {Object} handler - Handler object
 * @param {string} senderName - Name of sender
 * @param {string} body - Message body
 * @returns {Promise<Object>}
 */
export async function sendHandlerMessageEmail(ticket, handler, senderName, body) {
  const {
    ticketNumber,
    location,
    severityCode,
    severityLabel,
    workflowType,
    submittedAt,
    metadata
  } = ticket;

  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });
  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode);

  const html = `
${baseStyles}
<h2 class="section-title">Nieuw bericht</h2>
<p class="lead">Hallo ${escapeHtml(handler.name || 'collega')},</p>
<p class="lead">Er is een nieuw bericht ontvangen van de melder.</p>

<div class="card">
  <h3 class="section-title">Bericht</h3>
  <p><strong>Van:</strong> ${escapeHtml(senderName || 'Melder')}</p>
  <div>${nl2br(body || '-')}</div>
</div>

<div class="card">
  <h3 class="section-title">Meldingsoverzicht</h3>
  ${buildMetaTable([
    ['Ticketnummer', escapeHtml(ticketNumber || '-')],
    ['Huidige status', escapeHtml(statusLabel)],
    ['Ernst', `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    ['Workflow', escapeHtml(workflowType || '-')],
    ['Locatie', escapeHtml(location || 'Niet opgegeven')],
    ['Ingediend op', escapeHtml(formatDateNL(submittedAt))]
  ])}
</div>

<p class="muted">Log in op het portaal om te reageren.</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    to: handler.email,
    subject: `Nieuw bericht: ${ticketNumber || ''}`,
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
  sendHandlerStatusChangeEmail,
  sendAttachmentAddedEmail,
  sendReporterMessageEmail,
  sendHandlerMessageEmail
};

