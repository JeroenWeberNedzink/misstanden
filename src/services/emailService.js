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

const SUPPORTED_REPORTER_LANGS = ['en', 'nl', 'fr', 'de', 'pt'];

const LANGUAGE_TO_LOCALE = {
  en: 'en-GB',
  nl: 'nl-NL',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-PT',
};

const normalizeReporterLanguage = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .split('-')[0];

  return SUPPORTED_REPORTER_LANGS.includes(normalized) ? normalized : '';
};

export const resolveTicketLanguage = (ticket = {}) => {
  const candidates = [
    ticket?.reporterLanguage,
    ticket?.metadata?.reporterLanguage,
    ticket?.metadata?.reporter_language,
    ticket?.metadata?.reporterMetaClient?.language,
    ticket?.metadata?.reporter_meta_client?.language,
    ticket?.metadata?.reporterMetaClient?.languages?.[0],
    ticket?.metadata?.reporter_meta_client?.languages?.[0],
  ];

  for (const candidate of candidates) {
    const normalized = normalizeReporterLanguage(candidate);
    if (normalized) return normalized;
  }

  return 'en';
};

const formatDateByLanguage = (value, language = 'en') => {
  if (!value) return '-';
  try {
    const locale = LANGUAGE_TO_LOCALE[normalizeReporterLanguage(language) || 'en'] || 'en-GB';
    return new Date(value).toLocaleString(locale);
  } catch {
    return '-';
  }
};

const formatDateNL = (value) => formatDateByLanguage(value, 'nl');

const formatFileSize = (bytes) => {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const severityLabelFromCode = (code, language = 'en') => {
  const c = String(code ?? '').toLowerCase();
  const lang = normalizeReporterLanguage(language) || 'en';

  const labels = {
    en: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' },
    nl: { critical: 'Kritiek', high: 'Hoog', medium: 'Middel', low: 'Laag' },
    de: { critical: 'Kritisch', high: 'Hoch', medium: 'Mittel', low: 'Niedrig' },
    fr: { critical: 'Critique', high: 'Eleve', medium: 'Moyen', low: 'Faible' },
    pt: { critical: 'Critico', high: 'Alto', medium: 'Medio', low: 'Baixo' },
  };

  if (labels[lang]?.[c]) return labels[lang][c];
  return code ? String(code) : '-';
};

const REPORTER_EMAIL_COPY = {
  en: {
    greeting: 'Dear',
    reporterFallback: 'reporter',
    notProvided: 'Not provided',
    confirmationTitle: 'Confirmation of your report',
    confirmationIntro: 'Thank you for your report. We received it and started processing.',
    coreDetails: 'Core details',
    ticketNumber: 'Ticket number',
    status: 'Status',
    severity: 'Severity',
    workflow: 'Workflow',
    location: 'Location',
    submittedOn: 'Submitted on',
    description: 'Description',
    accessCode: 'Access code',
    accessCodeHelp: 'Keep this code to track your report status.',
    nextSteps: 'What happens next',
    nextStep1: 'We review your report and route it to the correct workflow.',
    nextStep2: 'You receive updates on important status changes.',
    nextStep3: 'Use your ticket number and access code to follow progress.',
    registeredAt: 'This report was registered on {{date}}.',
    subjectConfirmation: 'Report confirmation: {{ticket}}',
    statusUpdateTitle: 'Status update for your report',
    statusUpdateIntro: 'The status of your report has changed.',
    statusChange: 'Status change',
    reportOverview: 'Report overview',
    currentStatus: 'Current status',
    contactPerson: 'Contact person',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    note: 'Note',
    useAccessCode: 'Use this code to follow progress.',
    statusAutoUpdates: 'You will automatically receive updates on important changes.',
    statusMessageFallback: 'The status changed to {{status}}.',
    subjectStatus: 'Status update: {{ticket}}',
    attachmentAddedTitle: 'New attachment added',
    attachmentAddedIntro: 'A new attachment was added to your report.',
    attachmentDetails: 'Attachment',
    fileName: 'File name',
    fileType: 'Type',
    fileSize: 'Size',
    addedBy: 'Added by',
    addedOn: 'Added on',
    downloadAttachment: 'Download attachment',
    openPortalAttachments: 'Log in to the portal to view all attachments.',
    subjectAttachment: 'New attachment: {{ticket}}',
    newMessageTitle: 'New message',
    newMessageIntro: 'You received a new message in the communication portal.',
    message: 'Message',
    from: 'From',
    openPortalRespond: 'Log in to the portal to respond.',
    subjectMessage: 'New message: {{ticket}}',
    commentTitle: 'New comment',
    commentIntro: 'A new comment was added to your report.',
    comment: 'Comment',
    openPortalComment: 'Log in to the portal to view your report.',
    subjectComment: 'New comment: {{ticket}}',
    senderHandler: 'Handler',
  },
  nl: {
    greeting: 'Beste',
    reporterFallback: 'melder',
    notProvided: 'Niet opgegeven',
    confirmationTitle: 'Bevestiging van uw melding',
    confirmationIntro: 'Bedankt voor uw melding. We hebben deze ontvangen en nemen deze in behandeling.',
    coreDetails: 'Kerngegevens',
    ticketNumber: 'Ticketnummer',
    status: 'Status',
    severity: 'Ernst',
    workflow: 'Workflow',
    location: 'Locatie',
    submittedOn: 'Ingediend op',
    description: 'Omschrijving',
    accessCode: 'Toegangscode',
    accessCodeHelp: 'Bewaar deze code om de status van uw melding te volgen.',
    nextSteps: 'Wat gebeurt er nu',
    nextStep1: 'We beoordelen uw melding en koppelen deze aan de juiste workflow.',
    nextStep2: 'U ontvangt updates bij belangrijke statuswijzigingen.',
    nextStep3: 'Gebruik uw ticketnummer en toegangscode om de voortgang te volgen.',
    registeredAt: 'Deze melding is geregistreerd op {{date}}.',
    subjectConfirmation: 'Bevestiging melding: {{ticket}}',
    statusUpdateTitle: 'Statusupdate van uw melding',
    statusUpdateIntro: 'De status van uw melding is gewijzigd.',
    statusChange: 'Statuswijziging',
    reportOverview: 'Meldingsoverzicht',
    currentStatus: 'Huidige status',
    contactPerson: 'Contactpersoon',
    name: 'Naam',
    email: 'E-mail',
    phone: 'Telefoon',
    note: 'Notitie',
    useAccessCode: 'Gebruik deze code om de voortgang te volgen.',
    statusAutoUpdates: 'U ontvangt automatisch updates bij belangrijke wijzigingen.',
    statusMessageFallback: 'De status is gewijzigd naar {{status}}.',
    subjectStatus: 'Statusupdate: {{ticket}}',
    attachmentAddedTitle: 'Nieuwe bijlage toegevoegd',
    attachmentAddedIntro: 'Er is een nieuwe bijlage toegevoegd aan uw melding.',
    attachmentDetails: 'Bijlage',
    fileName: 'Bestandsnaam',
    fileType: 'Type',
    fileSize: 'Grootte',
    addedBy: 'Toegevoegd door',
    addedOn: 'Toegevoegd op',
    downloadAttachment: 'Download bijlage',
    openPortalAttachments: 'Log in op het portaal om alle bijlagen te bekijken.',
    subjectAttachment: 'Nieuwe bijlage: {{ticket}}',
    newMessageTitle: 'Nieuw bericht',
    newMessageIntro: 'U heeft een nieuw bericht ontvangen in het communicatieportaal.',
    message: 'Bericht',
    from: 'Van',
    openPortalRespond: 'Log in op het portaal om te reageren.',
    subjectMessage: 'Nieuw bericht: {{ticket}}',
    commentTitle: 'Nieuwe opmerking',
    commentIntro: 'Er is een nieuwe opmerking toegevoegd aan uw melding.',
    comment: 'Opmerking',
    openPortalComment: 'Log in op het portaal om de melding te bekijken.',
    subjectComment: 'Nieuwe opmerking: {{ticket}}',
    senderHandler: 'Behandelaar',
  },
  de: {
    greeting: 'Hallo',
    reporterFallback: 'Hinweisgeber',
    notProvided: 'Nicht angegeben',
    confirmationTitle: 'Bestaetigung Ihrer Meldung',
    confirmationIntro: 'Danke fuer Ihre Meldung. Wir haben sie erhalten und bearbeiten sie jetzt.',
    coreDetails: 'Kerndaten',
    ticketNumber: 'Ticketnummer',
    status: 'Status',
    severity: 'Prioritaet',
    workflow: 'Workflow',
    location: 'Ort',
    submittedOn: 'Eingereicht am',
    description: 'Beschreibung',
    accessCode: 'Zugangscode',
    accessCodeHelp: 'Bewahren Sie diesen Code auf, um den Status zu verfolgen.',
    nextSteps: 'Naechste Schritte',
    nextStep1: 'Wir pruefen Ihre Meldung und leiten sie in den richtigen Workflow.',
    nextStep2: 'Sie erhalten Updates bei wichtigen Statusaenderungen.',
    nextStep3: 'Verfolgen Sie den Fortschritt mit Ticketnummer und Zugangscode.',
    registeredAt: 'Diese Meldung wurde am {{date}} registriert.',
    subjectConfirmation: 'Bestaetigung Meldung: {{ticket}}',
    statusUpdateTitle: 'Statusupdate Ihrer Meldung',
    statusUpdateIntro: 'Der Status Ihrer Meldung hat sich geaendert.',
    statusChange: 'Statusaenderung',
    reportOverview: 'Meldungsuebersicht',
    currentStatus: 'Aktueller Status',
    contactPerson: 'Kontaktperson',
    name: 'Name',
    email: 'E-Mail',
    phone: 'Telefon',
    note: 'Notiz',
    useAccessCode: 'Verwenden Sie diesen Code, um den Fortschritt zu verfolgen.',
    statusAutoUpdates: 'Sie erhalten automatisch Updates bei wichtigen Aenderungen.',
    statusMessageFallback: 'Der Status wurde auf {{status}} geaendert.',
    subjectStatus: 'Statusupdate: {{ticket}}',
    attachmentAddedTitle: 'Neuer Anhang hinzugefuegt',
    attachmentAddedIntro: 'Ein neuer Anhang wurde zu Ihrer Meldung hinzugefuegt.',
    attachmentDetails: 'Anhang',
    fileName: 'Dateiname',
    fileType: 'Typ',
    fileSize: 'Groesse',
    addedBy: 'Hinzugefuegt von',
    addedOn: 'Hinzugefuegt am',
    downloadAttachment: 'Anhang herunterladen',
    openPortalAttachments: 'Melden Sie sich im Portal an, um alle Anhaenge zu sehen.',
    subjectAttachment: 'Neuer Anhang: {{ticket}}',
    newMessageTitle: 'Neue Nachricht',
    newMessageIntro: 'Sie haben eine neue Nachricht im Kommunikationsportal erhalten.',
    message: 'Nachricht',
    from: 'Von',
    openPortalRespond: 'Melden Sie sich im Portal an, um zu antworten.',
    subjectMessage: 'Neue Nachricht: {{ticket}}',
    commentTitle: 'Neuer Kommentar',
    commentIntro: 'Ein neuer Kommentar wurde zu Ihrer Meldung hinzugefuegt.',
    comment: 'Kommentar',
    openPortalComment: 'Melden Sie sich im Portal an, um die Meldung anzusehen.',
    subjectComment: 'Neuer Kommentar: {{ticket}}',
    senderHandler: 'Bearbeiter',
  },
  fr: {
    greeting: 'Bonjour',
    reporterFallback: 'declarant',
    notProvided: 'Non precise',
    confirmationTitle: 'Confirmation de votre signalement',
    confirmationIntro: 'Merci pour votre signalement. Nous l avons recu et il est en cours de traitement.',
    coreDetails: 'Informations principales',
    ticketNumber: 'Numero de ticket',
    status: 'Statut',
    severity: 'Gravite',
    workflow: 'Workflow',
    location: 'Lieu',
    submittedOn: 'Soumis le',
    description: 'Description',
    accessCode: 'Code d acces',
    accessCodeHelp: 'Conservez ce code pour suivre le statut.',
    nextSteps: 'Etapes suivantes',
    nextStep1: 'Nous evaluons votre signalement et le dirigeons vers le bon workflow.',
    nextStep2: 'Vous recevrez des mises a jour lors des changements importants.',
    nextStep3: 'Utilisez votre numero de ticket et votre code d acces pour suivre la progression.',
    registeredAt: 'Ce signalement a ete enregistre le {{date}}.',
    subjectConfirmation: 'Confirmation signalement: {{ticket}}',
    statusUpdateTitle: 'Mise a jour du statut de votre signalement',
    statusUpdateIntro: 'Le statut de votre signalement a change.',
    statusChange: 'Changement de statut',
    reportOverview: 'Apercu du signalement',
    currentStatus: 'Statut actuel',
    contactPerson: 'Personne de contact',
    name: 'Nom',
    email: 'E-mail',
    phone: 'Telephone',
    note: 'Note',
    useAccessCode: 'Utilisez ce code pour suivre la progression.',
    statusAutoUpdates: 'Vous recevrez automatiquement les mises a jour importantes.',
    statusMessageFallback: 'Le statut est passe a {{status}}.',
    subjectStatus: 'Mise a jour du statut: {{ticket}}',
    attachmentAddedTitle: 'Nouvelle piece jointe ajoutee',
    attachmentAddedIntro: 'Une nouvelle piece jointe a ete ajoutee a votre signalement.',
    attachmentDetails: 'Piece jointe',
    fileName: 'Nom du fichier',
    fileType: 'Type',
    fileSize: 'Taille',
    addedBy: 'Ajoute par',
    addedOn: 'Ajoute le',
    downloadAttachment: 'Telecharger la piece jointe',
    openPortalAttachments: 'Connectez-vous au portail pour voir toutes les pieces jointes.',
    subjectAttachment: 'Nouvelle piece jointe: {{ticket}}',
    newMessageTitle: 'Nouveau message',
    newMessageIntro: 'Vous avez recu un nouveau message dans le portail de communication.',
    message: 'Message',
    from: 'De',
    openPortalRespond: 'Connectez-vous au portail pour repondre.',
    subjectMessage: 'Nouveau message: {{ticket}}',
    commentTitle: 'Nouveau commentaire',
    commentIntro: 'Un nouveau commentaire a ete ajoute a votre signalement.',
    comment: 'Commentaire',
    openPortalComment: 'Connectez-vous au portail pour voir votre signalement.',
    subjectComment: 'Nouveau commentaire: {{ticket}}',
    senderHandler: 'Gestionnaire',
  },
  pt: {
    greeting: 'Ola',
    reporterFallback: 'reportante',
    notProvided: 'Nao informado',
    confirmationTitle: 'Confirmacao do seu reporte',
    confirmationIntro: 'Obrigado pelo seu reporte. Recebemos e iniciamos o tratamento.',
    coreDetails: 'Detalhes principais',
    ticketNumber: 'Numero do ticket',
    status: 'Status',
    severity: 'Severidade',
    workflow: 'Fluxo',
    location: 'Local',
    submittedOn: 'Enviado em',
    description: 'Descricao',
    accessCode: 'Codigo de acesso',
    accessCodeHelp: 'Guarde este codigo para acompanhar o status.',
    nextSteps: 'Proximos passos',
    nextStep1: 'Vamos revisar seu reporte e encaminhar para o fluxo correto.',
    nextStep2: 'Voce recebera atualizacoes em mudancas importantes.',
    nextStep3: 'Use o numero do ticket e o codigo de acesso para acompanhar o progresso.',
    registeredAt: 'Este reporte foi registrado em {{date}}.',
    subjectConfirmation: 'Confirmacao do reporte: {{ticket}}',
    statusUpdateTitle: 'Atualizacao de status do seu reporte',
    statusUpdateIntro: 'O status do seu reporte foi alterado.',
    statusChange: 'Mudanca de status',
    reportOverview: 'Visao geral do reporte',
    currentStatus: 'Status atual',
    contactPerson: 'Pessoa de contato',
    name: 'Nome',
    email: 'E-mail',
    phone: 'Telefone',
    note: 'Nota',
    useAccessCode: 'Use este codigo para acompanhar o progresso.',
    statusAutoUpdates: 'Voce recebera atualizacoes automaticas em mudancas importantes.',
    statusMessageFallback: 'O status foi alterado para {{status}}.',
    subjectStatus: 'Atualizacao de status: {{ticket}}',
    attachmentAddedTitle: 'Novo anexo adicionado',
    attachmentAddedIntro: 'Um novo anexo foi adicionado ao seu reporte.',
    attachmentDetails: 'Anexo',
    fileName: 'Nome do arquivo',
    fileType: 'Tipo',
    fileSize: 'Tamanho',
    addedBy: 'Adicionado por',
    addedOn: 'Adicionado em',
    downloadAttachment: 'Baixar anexo',
    openPortalAttachments: 'Entre no portal para ver todos os anexos.',
    subjectAttachment: 'Novo anexo: {{ticket}}',
    newMessageTitle: 'Nova mensagem',
    newMessageIntro: 'Voce recebeu uma nova mensagem no portal de comunicacao.',
    message: 'Mensagem',
    from: 'De',
    openPortalRespond: 'Entre no portal para responder.',
    subjectMessage: 'Nova mensagem: {{ticket}}',
    commentTitle: 'Novo comentario',
    commentIntro: 'Um novo comentario foi adicionado ao seu reporte.',
    comment: 'Comentario',
    openPortalComment: 'Entre no portal para ver seu reporte.',
    subjectComment: 'Novo comentario: {{ticket}}',
    senderHandler: 'Responsavel',
  },
};

export const getReporterEmailCopy = (language) => {
  const lang = normalizeReporterLanguage(language) || 'en';
  return REPORTER_EMAIL_COPY[lang] || REPORTER_EMAIL_COPY.en;
};

const localizedStatusMessage = (language, statusValue) => {
  const lang = normalizeReporterLanguage(language) || 'en';
  const copy = getReporterEmailCopy(lang);
  const raw = String(statusValue || '');
  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const map = {
    new: {
      en: 'Your report was received and will be picked up shortly.',
      nl: 'Uw melding is ontvangen en wordt binnenkort opgepakt.',
      de: 'Ihre Meldung wurde erhalten und wird in Kuerze bearbeitet.',
      fr: 'Votre signalement a ete recu et sera traite rapidement.',
      pt: 'Seu reporte foi recebido e sera tratado em breve.',
    },
    in_behandeling: {
      en: 'Your report is being reviewed by our team.',
      nl: 'Uw melding wordt beoordeeld door ons team.',
      de: 'Ihre Meldung wird von unserem Team geprueft.',
      fr: 'Votre signalement est en cours d evaluation par notre equipe.',
      pt: 'Seu reporte esta sendo analisado pela nossa equipe.',
    },
    in_progress: {
      en: 'Your report is being reviewed by our team.',
      nl: 'Uw melding wordt beoordeeld door ons team.',
      de: 'Ihre Meldung wird von unserem Team geprueft.',
      fr: 'Votre signalement est en cours d evaluation par notre equipe.',
      pt: 'Seu reporte esta sendo analisado pela nossa equipe.',
    },
    onderzoek: {
      en: 'Your report is under investigation.',
      nl: 'Uw melding wordt onderzocht.',
      de: 'Ihre Meldung wird untersucht.',
      fr: 'Votre signalement est en cours d enquete.',
      pt: 'Seu reporte esta sob investigacao.',
    },
    actie: {
      en: 'Action is being taken on your report.',
      nl: 'Er wordt actie ondernomen op uw melding.',
      de: 'Es werden Massnahmen zu Ihrer Meldung ergriffen.',
      fr: 'Des actions sont en cours sur votre signalement.',
      pt: 'Acoes estao sendo tomadas para seu reporte.',
    },
    afgerond: {
      en: 'Your report has been resolved.',
      nl: 'Uw melding is opgelost.',
      de: 'Ihre Meldung wurde geloest.',
      fr: 'Votre signalement a ete resolu.',
      pt: 'Seu reporte foi resolvido.',
    },
    gesloten: {
      en: 'Your report has been closed.',
      nl: 'Uw melding is afgesloten.',
      de: 'Ihre Meldung wurde geschlossen.',
      fr: 'Votre signalement a ete cloture.',
      pt: 'Seu reporte foi encerrado.',
    },
    wacht_op_info: {
      en: 'We are waiting for additional information.',
      nl: 'We wachten op aanvullende informatie.',
      de: 'Wir warten auf zusaetzliche Informationen.',
      fr: 'Nous attendons des informations complementaires.',
      pt: 'Estamos aguardando informacoes adicionais.',
    },
  };

  const msg = map[key]?.[lang];
  if (msg) return msg;
  return copy.statusMessageFallback.replace('{{status}}', raw || '-');
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

  const language = resolveTicketLanguage(ticket);
  const copy = getReporterEmailCopy(language);
  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode, language);
  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });

  const html = `
${baseStyles}
<h2 class="section-title">${escapeHtml(copy.confirmationTitle)}</h2>
<p class="lead">${escapeHtml(copy.greeting || 'Dear')} ${escapeHtml(reporterName || copy.reporterFallback)},</p>
<p class="lead">${escapeHtml(copy.confirmationIntro)}</p>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.coreDetails)}</h3>
  ${buildMetaTable([
    [copy.ticketNumber, escapeHtml(ticketNumber || '-')],
    [copy.status, escapeHtml(statusLabel)],
    [copy.severity, `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    [copy.workflow, escapeHtml(workflowType || '-')],
    [copy.location, escapeHtml(location || copy.notProvided)],
    [copy.submittedOn, escapeHtml(formatDateByLanguage(submittedAt, language))]
  ])}
  <div class="section-title" style="margin-top:12px;">${escapeHtml(copy.description)}</div>
  <div>${nl2br(description || '-')}</div>
</div>

${accessCode ? `
<div class="callout">
  <strong>${escapeHtml(copy.accessCode)}:</strong> ${escapeHtml(accessCode)}<br/>
  ${escapeHtml(copy.accessCodeHelp)}
</div>
` : ''}

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.nextSteps)}</h3>
  <ul class="list">
    <li>${escapeHtml(copy.nextStep1)}</li>
    <li>${escapeHtml(copy.nextStep2)}</li>
    <li>${escapeHtml(copy.nextStep3)}</li>
  </ul>
</div>

<p class="muted">${escapeHtml(copy.registeredAt.replace('{{date}}', formatDateByLanguage(submittedAt, language)))}</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    ...reporterTarget,
    subject: copy.subjectConfirmation.replace('{{ticket}}', ticketNumber || '-'),
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

  const language = resolveTicketLanguage(ticket);
  const copy = getReporterEmailCopy(language);
  const statusMessage = localizedStatusMessage(language, newStatus);
  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode, language);
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
<h2 class="section-title">${escapeHtml(copy.statusUpdateTitle)}</h2>
<p class="lead">${escapeHtml(copy.greeting || 'Dear')} ${escapeHtml(reporterName || copy.reporterFallback)},</p>
<p class="lead">${escapeHtml(copy.statusUpdateIntro)}</p>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.statusChange)}</h3>
  <p style="margin:6px 0;">
    <span class="badge badge-neutral">${escapeHtml(oldStatus || '-')}</span>
    →
    <span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(newStatus || '-')}</span>
  </p>
  <p class="muted">${escapeHtml(statusMessage)}</p>
</div>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.reportOverview)}</h3>
  ${buildMetaTable([
    [copy.ticketNumber, escapeHtml(ticketNumber || '-')],
    [copy.currentStatus, escapeHtml(statusLabel)],
    [copy.severity, `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    [copy.workflow, escapeHtml(workflowType || '-')],
    [copy.location, escapeHtml(location || copy.notProvided)],
    [copy.submittedOn, escapeHtml(formatDateByLanguage(submittedAt, language))]
  ])}
  <div class="section-title" style="margin-top:12px;">${escapeHtml(copy.description)}</div>
  <div>${nl2br(description || '-')}</div>
</div>

${hasContact ? `
<div class="card">
  <h3 class="section-title">${escapeHtml(copy.contactPerson)}</h3>
  ${buildMetaTable([
    [copy.name, escapeHtml(contactName || '-')],
    [copy.email, escapeHtml(contactEmail || '-')],
    [copy.phone, escapeHtml(contactPhone || '-')],
    [copy.note, escapeHtml(contactNotes || '-')]
  ])}
</div>
` : ''}

${accessCode ? `
<div class="callout">
  <strong>${escapeHtml(copy.accessCode)}:</strong> ${escapeHtml(accessCode)}<br/>
  ${escapeHtml(copy.useAccessCode)}
</div>
` : ''}

<p class="muted">${escapeHtml(copy.statusAutoUpdates)}</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    ...reporterTarget,
    subject: copy.subjectStatus.replace('{{ticket}}', ticketNumber || '-'),
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

  const language = resolveTicketLanguage(ticket);
  const copy = getReporterEmailCopy(language);
  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });
  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode, language);
  const fileName = attachment?.fileName || attachment?.name || '-';
  const fileType = attachment?.mimeType || attachment?.type || '-';
  const fileSize = formatFileSize(attachment?.sizeBytes || attachment?.size || 0);
  const fileUrl = attachment?.fileUrl || attachment?.url || '';

  const html = `
${baseStyles}
<h2 class="section-title">${escapeHtml(copy.attachmentAddedTitle)}</h2>
<p class="lead">${escapeHtml(copy.greeting || 'Dear')} ${escapeHtml(reporterName || copy.reporterFallback)},</p>
<p class="lead">${escapeHtml(copy.attachmentAddedIntro)}</p>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.attachmentDetails)}</h3>
  ${buildMetaTable([
    [copy.fileName, escapeHtml(fileName)],
    [copy.fileType, escapeHtml(fileType)],
    [copy.fileSize, escapeHtml(fileSize)],
    [copy.addedBy, escapeHtml(uploaderName || copy.senderHandler)],
    [copy.addedOn, escapeHtml(formatDateByLanguage(attachment?.createdAt || attachment?.created_at, language))]
  ])}
  ${fileUrl ? `<p><a href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(copy.downloadAttachment)}</a></p>` : ''}
</div>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.reportOverview)}</h3>
  ${buildMetaTable([
    [copy.ticketNumber, escapeHtml(ticketNumber || '-')],
    [copy.currentStatus, escapeHtml(statusLabel)],
    [copy.severity, `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    [copy.workflow, escapeHtml(workflowType || '-')],
    [copy.location, escapeHtml(location || copy.notProvided)],
    [copy.submittedOn, escapeHtml(formatDateByLanguage(submittedAt, language))]
  ])}
</div>

<p class="muted">${escapeHtml(copy.openPortalAttachments)}</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    ...reporterTarget,
    subject: copy.subjectAttachment.replace('{{ticket}}', ticketNumber || '-'),
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

  const language = resolveTicketLanguage(ticket);
  const copy = getReporterEmailCopy(language);
  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });
  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode, language);

  const html = `
${baseStyles}
<h2 class="section-title">${escapeHtml(copy.newMessageTitle)}</h2>
<p class="lead">${escapeHtml(copy.greeting || 'Dear')} ${escapeHtml(reporterName || copy.reporterFallback)},</p>
<p class="lead">${escapeHtml(copy.newMessageIntro)}</p>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.message)}</h3>
  <p><strong>${escapeHtml(copy.from)}:</strong> ${escapeHtml(senderName || copy.senderHandler)}</p>
  <div>${nl2br(body || '-')}</div>
</div>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.reportOverview)}</h3>
  ${buildMetaTable([
    [copy.ticketNumber, escapeHtml(ticketNumber || '-')],
    [copy.currentStatus, escapeHtml(statusLabel)],
    [copy.severity, `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    [copy.workflow, escapeHtml(workflowType || '-')],
    [copy.location, escapeHtml(location || copy.notProvided)],
    [copy.submittedOn, escapeHtml(formatDateByLanguage(submittedAt, language))]
  ])}
</div>

<p class="muted">${escapeHtml(copy.openPortalRespond)}</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    ...reporterTarget,
    subject: copy.subjectMessage.replace('{{ticket}}', ticketNumber || '-'),
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

