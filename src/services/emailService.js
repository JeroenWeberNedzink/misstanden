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

const resolveHandlerLanguage = (handler = {}, ticket = {}) => {
  const candidates = [
    handler?.language,
    handler?.preferredLanguage,
    handler?.preferred_language,
    handler?.locale,
    handler?.lang,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeReporterLanguage(candidate);
    if (normalized) return normalized;
  }

  return resolveTicketLanguage(ticket);
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

const addHoursSafe = (value, hours) => {
  if (!value || !Number.isFinite(Number(hours))) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(d.getHours() + Number(hours));
  return d.toISOString();
};

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
    confirmationSupportingText: 'Keep this email carefully. You need your ticket number and access code to check your report later.',
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
    portalAccessTitle: 'How to access your report',
    portalAccessIntro: 'Use the details below to view your report status in the portal.',
    portalLinkLabel: 'Open report portal',
    portalUrlLabel: 'Portal',
    portalInstruction1: 'Open the report portal.',
    portalInstruction2: 'Enter your ticket number exactly as shown below.',
    portalInstruction3: 'Enter your 6-digit access code.',
    portalInstruction4: 'Click the button to view the status of your report.',
    credentialsTitle: 'Your login details',
    credentialHelp: 'Without these details you cannot open your report in the portal.',
    saveDetailsTitle: 'Important',
    saveDetailsBody: 'Save this email or write down the ticket number and access code somewhere safe.',
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
    senderReporter: 'Reporter',
    senderAnonymousReporter: 'Anonymous reporter',
    handlerMessageIntro: 'A new message was posted in this case.',
    assignmentStartedTitle: 'Your report is now being processed',
    assignmentStartedIntro: 'A handler has been assigned to your report.',
    assignmentStartedSlaHint: 'Your report is being processed. You will receive a status update within the SLA timeframes.',
    processingStartedAt: 'Processing started at',
    firstResponseBy: 'First response by',
    resolutionTarget: 'Resolution target',
    assignedHandlers: 'Assigned handler(s)',
    assignmentStartedFooter: 'Thank you for your patience. We will keep you informed.',
    subjectAssignmentStarted: 'Processing started: {{ticket}}',
  },
  nl: {
    greeting: 'Beste',
    reporterFallback: 'melder',
    notProvided: 'Niet opgegeven',
    confirmationTitle: 'Bevestiging van uw melding',
    confirmationIntro: 'Bedankt voor uw melding. We hebben deze ontvangen en nemen deze in behandeling.',
    confirmationSupportingText: 'Bewaar deze e-mail goed. U heeft uw ticketnummer en toegangscode later nodig om uw melding terug te openen.',
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
    portalAccessTitle: 'Zo opent u uw melding opnieuw',
    portalAccessIntro: 'Gebruik onderstaande gegevens om uw melding later terug te vinden in het portaal.',
    portalLinkLabel: 'Open meldingenportaal',
    portalUrlLabel: 'Portaal',
    portalInstruction1: 'Open het meldingenportaal.',
    portalInstruction2: 'Vul uw ticketnummer exact zo in als hieronder staat.',
    portalInstruction3: 'Vul daarna uw 6-cijferige toegangscode in.',
    portalInstruction4: 'Klik op de knop om de status van uw melding te bekijken.',
    credentialsTitle: 'Uw inloggegevens',
    credentialHelp: 'Zonder deze gegevens kunt u uw melding niet openen in het portaal.',
    saveDetailsTitle: 'Belangrijk',
    saveDetailsBody: 'Bewaar deze e-mail of noteer ticketnummer en toegangscode op een veilige plaats.',
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
    senderReporter: 'Melder',
    senderAnonymousReporter: 'Anonieme melder',
    handlerMessageIntro: 'Er is een nieuw bericht geplaatst in deze zaak.',
    assignmentStartedTitle: 'Uw melding wordt nu behandeld',
    assignmentStartedIntro: 'Er is een behandelaar toegewezen aan uw melding.',
    assignmentStartedSlaHint: 'Uw melding is in behandeling. U ontvangt binnen de SLA-termijnen een statusupdate.',
    processingStartedAt: 'Behandeling gestart op',
    firstResponseBy: 'Eerste reactie uiterlijk',
    resolutionTarget: 'Streefdatum afronding',
    assignedHandlers: 'Toegewezen behandelaar(s)',
    assignmentStartedFooter: 'Dank voor uw geduld. Wij houden u op de hoogte.',
    subjectAssignmentStarted: 'Behandeling gestart: {{ticket}}',
  },
  de: {
    greeting: 'Hallo',
    reporterFallback: 'Hinweisgeber',
    notProvided: 'Nicht angegeben',
    confirmationTitle: 'Bestaetigung Ihrer Meldung',
    confirmationIntro: 'Danke fuer Ihre Meldung. Wir haben sie erhalten und bearbeiten sie jetzt.',
    confirmationSupportingText: 'Bewahren Sie diese E-Mail gut auf. Sie brauchen Ticketnummer und Zugangscode, um Ihre Meldung spaeter wieder zu oeffnen.',
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
    portalAccessTitle: 'So greifen Sie auf Ihre Meldung zu',
    portalAccessIntro: 'Verwenden Sie die folgenden Angaben, um den Status Ihrer Meldung im Portal zu sehen.',
    portalLinkLabel: 'Meldeportal oeffnen',
    portalUrlLabel: 'Portal',
    portalInstruction1: 'Oeffnen Sie das Meldeportal.',
    portalInstruction2: 'Geben Sie Ihre Ticketnummer genau wie unten gezeigt ein.',
    portalInstruction3: 'Geben Sie Ihren 6-stelligen Zugangscode ein.',
    portalInstruction4: 'Klicken Sie auf die Schaltflaeche, um den Status Ihrer Meldung anzuzeigen.',
    credentialsTitle: 'Ihre Zugangsdaten',
    credentialHelp: 'Ohne diese Daten koennen Sie Ihre Meldung im Portal nicht oeffnen.',
    saveDetailsTitle: 'Wichtig',
    saveDetailsBody: 'Speichern Sie diese E-Mail oder notieren Sie Ticketnummer und Zugangscode an einem sicheren Ort.',
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
    senderReporter: 'Hinweisgeber',
    senderAnonymousReporter: 'Anonymer Hinweisgeber',
    handlerMessageIntro: 'In diesem Fall wurde eine neue Nachricht veroeffentlicht.',
    assignmentStartedTitle: 'Ihre Meldung wird jetzt bearbeitet',
    assignmentStartedIntro: 'Ein Bearbeiter wurde Ihrer Meldung zugewiesen.',
    assignmentStartedSlaHint: 'Ihre Meldung ist in Bearbeitung. Sie erhalten ein Statusupdate innerhalb der SLA-Fristen.',
    processingStartedAt: 'Bearbeitung gestartet am',
    firstResponseBy: 'Erste Rueckmeldung bis',
    resolutionTarget: 'Zieltermin Loesung',
    assignedHandlers: 'Zugewiesene Bearbeiter',
    assignmentStartedFooter: 'Vielen Dank fuer Ihre Geduld. Wir halten Sie auf dem Laufenden.',
    subjectAssignmentStarted: 'Bearbeitung gestartet: {{ticket}}',
  },
  fr: {
    greeting: 'Bonjour',
    reporterFallback: 'declarant',
    notProvided: 'Non precise',
    confirmationTitle: 'Confirmation de votre signalement',
    confirmationIntro: 'Merci pour votre signalement. Nous l avons recu et il est en cours de traitement.',
    confirmationSupportingText: 'Conservez bien cet e-mail. Vous aurez besoin du numero de ticket et du code d acces pour rouvrir votre signalement plus tard.',
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
    portalAccessTitle: 'Comment acceder a votre signalement',
    portalAccessIntro: 'Utilisez les informations ci-dessous pour consulter le statut de votre signalement dans le portail.',
    portalLinkLabel: 'Ouvrir le portail',
    portalUrlLabel: 'Portail',
    portalInstruction1: 'Ouvrez le portail de signalement.',
    portalInstruction2: 'Saisissez votre numero de ticket exactement comme indique ci-dessous.',
    portalInstruction3: 'Saisissez ensuite votre code d acces a 6 chiffres.',
    portalInstruction4: 'Cliquez sur le bouton pour afficher le statut de votre signalement.',
    credentialsTitle: 'Vos donnees de connexion',
    credentialHelp: 'Sans ces informations, vous ne pourrez pas ouvrir votre signalement dans le portail.',
    saveDetailsTitle: 'Important',
    saveDetailsBody: 'Conservez cet e-mail ou notez le numero de ticket et le code d acces dans un endroit sur.',
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
    senderReporter: 'Declarant',
    senderAnonymousReporter: 'Declarant anonyme',
    handlerMessageIntro: 'Un nouveau message a ete publie dans ce dossier.',
    assignmentStartedTitle: 'Votre signalement est maintenant en cours de traitement',
    assignmentStartedIntro: 'Un gestionnaire a ete assigne a votre signalement.',
    assignmentStartedSlaHint: 'Votre signalement est en traitement. Vous recevrez une mise a jour de statut dans les delais SLA.',
    processingStartedAt: 'Traitement demarre le',
    firstResponseBy: 'Premiere reponse avant',
    resolutionTarget: 'Objectif de resolution',
    assignedHandlers: 'Gestionnaire(s) assigne(s)',
    assignmentStartedFooter: 'Merci pour votre patience. Nous vous tiendrons informe.',
    subjectAssignmentStarted: 'Traitement demarre: {{ticket}}',
  },
  pt: {
    greeting: 'Ola',
    reporterFallback: 'reportante',
    notProvided: 'Nao informado',
    confirmationTitle: 'Confirmacao do seu reporte',
    confirmationIntro: 'Obrigado pelo seu reporte. Recebemos e iniciamos o tratamento.',
    confirmationSupportingText: 'Guarde este e-mail com cuidado. Voce precisara do numero do ticket e do codigo de acesso para abrir o reporte novamente depois.',
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
    portalAccessTitle: 'Como acessar seu reporte',
    portalAccessIntro: 'Use os dados abaixo para consultar o status do seu reporte no portal.',
    portalLinkLabel: 'Abrir portal',
    portalUrlLabel: 'Portal',
    portalInstruction1: 'Abra o portal de reportes.',
    portalInstruction2: 'Digite o numero do ticket exatamente como aparece abaixo.',
    portalInstruction3: 'Digite o codigo de acesso de 6 digitos.',
    portalInstruction4: 'Clique no botao para visualizar o status do seu reporte.',
    credentialsTitle: 'Seus dados de acesso',
    credentialHelp: 'Sem esses dados, voce nao conseguira abrir seu reporte no portal.',
    saveDetailsTitle: 'Importante',
    saveDetailsBody: 'Guarde este e-mail ou anote o numero do ticket e o codigo de acesso em um local seguro.',
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
    senderReporter: 'Reportante',
    senderAnonymousReporter: 'Reportante anonimo',
    handlerMessageIntro: 'Uma nova mensagem foi publicada neste caso.',
    assignmentStartedTitle: 'Seu reporte esta agora em tratamento',
    assignmentStartedIntro: 'Um responsavel foi atribuido ao seu reporte.',
    assignmentStartedSlaHint: 'Seu reporte esta em tratamento. Voce recebera uma atualizacao de status dentro dos prazos de SLA.',
    processingStartedAt: 'Tratamento iniciado em',
    firstResponseBy: 'Primeira resposta ate',
    resolutionTarget: 'Meta de resolucao',
    assignedHandlers: 'Responsavel(is) atribuido(s)',
    assignmentStartedFooter: 'Obrigado pela sua paciencia. Manteremos voce informado.',
    subjectAssignmentStarted: 'Tratamento iniciado: {{ticket}}',
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

const getPortalAccessUrl = () => {
  try {
    if (typeof window !== 'undefined' && window?.location?.origin) {
      return `${window.location.origin}/ticket-access-portal`;
    }
  } catch {
    // ignore
  }
  return 'https://misstanden.nedzink.nl/ticket-access-portal';
};

const getPortalOrigin = () => getPortalAccessUrl().replace(/\/ticket-access-portal\/?$/i, '');

const toAbsolutePortalUrl = (url) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${getPortalOrigin()}${value.startsWith('/') ? value : `/${value}`}`;
};

const baseStyles = `
<style>
  .email-shell { background: #ffffff; border: 1px solid #d9e6f2; border-radius: 18px; overflow: hidden; margin: 0; }
  .brand-header { background: linear-gradient(180deg, #f7fbff 0%, #edf5fb 100%); border-bottom: 1px solid #d9e6f2; padding: 22px 24px 18px; }
  .brand-topline { margin: 0 0 6px 0; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #5d7f9f; }
  .brand-title { margin: 0; font-size: 24px; line-height: 1.2; font-weight: 700; color: #0f3b63; }
  .brand-subtitle { margin: 10px 0 0 0; font-size: 14px; line-height: 1.6; color: #35526d; }
  .email-content { padding: 22px 24px 26px; background: #ffffff; }
  .section-title { margin: 0 0 8px 0; font-size: 16px; color: #0f172a; }
  .lead { margin: 0 0 12px 0; font-size: 15px; color: #1f2937; }
  .card { background: #f8fbfe; border: 1px solid #dce8f3; border-radius: 14px; padding: 18px; margin: 14px 0; }
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
  .callout { background: #f4f9fd; border-left: 4px solid #2e6f9f; padding: 14px; border-radius: 10px; margin: 14px 0; }
  .callout strong { color: #0f172a; }
  .instruction-list { margin: 10px 0 0 0; padding: 0; list-style: none; }
  .instruction-list li { margin: 0 0 10px 0; padding-left: 34px; position: relative; color: #29445b; line-height: 1.5; }
  .instruction-step { position: absolute; left: 0; top: 0; width: 22px; height: 22px; border-radius: 999px; background: #0f5f9c; color: #ffffff; font-size: 12px; font-weight: 700; text-align: center; line-height: 22px; }
  .credential-grid { width: 100%; border-collapse: separate; border-spacing: 12px; margin: 10px -12px 0; }
  .credential-card { background: #ffffff; border: 1px solid #cfe0ed; border-radius: 12px; padding: 14px; }
  .credential-label { margin: 0 0 6px 0; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #62809b; }
  .credential-value { margin: 0; font-size: 22px; line-height: 1.2; font-weight: 700; letter-spacing: 0.02em; color: #103a60; }
  .credential-value.mono { font-family: Consolas, 'Courier New', monospace; font-size: 24px; }
  .portal-link-box { background: #ffffff; border: 1px solid #cfe0ed; border-radius: 12px; padding: 14px; margin-top: 12px; }
  .portal-link-label { margin: 0 0 6px 0; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #62809b; }
  .portal-link-url { color: #0f5f9c; word-break: break-all; font-size: 14px; line-height: 1.5; text-decoration: none; }
  .portal-button { display: inline-block; margin-top: 14px; padding: 12px 18px; background: #0f5f9c; color: #ffffff !important; border-radius: 10px; font-size: 14px; font-weight: 700; text-decoration: none; }
  .portal-button:hover { background: #0b4e81; }
  .help-note { margin: 10px 0 0 0; font-size: 13px; color: #476782; line-height: 1.6; }
  .divider-space { height: 4px; }
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
  const portalUrl = getPortalAccessUrl();

  const html = `
${baseStyles}
<div class="email-shell">
  <div class="brand-header">
    <div class="brand-topline">NedZink</div>
    <h1 class="brand-title">${escapeHtml(copy.confirmationTitle)}</h1>
    <p class="brand-subtitle">${escapeHtml(copy.confirmationIntro)}</p>
  </div>

  <div class="email-content">
    <p class="lead">${escapeHtml(copy.greeting || 'Dear')} ${escapeHtml(reporterName || copy.reporterFallback)},</p>
    <p class="lead">${escapeHtml(copy.confirmationSupportingText || copy.accessCodeHelp)}</p>

    <div class="card">
      <h3 class="section-title">${escapeHtml(copy.credentialsTitle || copy.accessCode)}</h3>
      <p class="help-note">${escapeHtml(copy.credentialHelp || copy.accessCodeHelp)}</p>
      <table class="credential-grid" role="presentation">
        <tr>
          <td width="50%" style="vertical-align:top;">
            <div class="credential-card">
              <div class="credential-label">${escapeHtml(copy.ticketNumber)}</div>
              <p class="credential-value mono">${escapeHtml(ticketNumber || '-')}</p>
            </div>
          </td>
          <td width="50%" style="vertical-align:top;">
            <div class="credential-card">
              <div class="credential-label">${escapeHtml(copy.accessCode)}</div>
              <p class="credential-value mono">${escapeHtml(accessCode || '-')}</p>
            </div>
          </td>
        </tr>
      </table>
      <div class="callout">
        <strong>${escapeHtml(copy.saveDetailsTitle || 'Important')}</strong><br/>
        ${escapeHtml(copy.saveDetailsBody || copy.accessCodeHelp)}
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">${escapeHtml(copy.portalAccessTitle || copy.nextSteps)}</h3>
      <p class="lead">${escapeHtml(copy.portalAccessIntro || copy.nextStep3)}</p>
      <ol class="instruction-list">
        <li><span class="instruction-step">1</span>${escapeHtml(copy.portalInstruction1 || copy.nextStep1)}</li>
        <li><span class="instruction-step">2</span>${escapeHtml(copy.portalInstruction2 || copy.nextStep3)}</li>
        <li><span class="instruction-step">3</span>${escapeHtml(copy.portalInstruction3 || copy.accessCodeHelp)}</li>
        <li><span class="instruction-step">4</span>${escapeHtml(copy.portalInstruction4 || copy.nextStep3)}</li>
      </ol>
      <div class="portal-link-box">
        <div class="portal-link-label">${escapeHtml(copy.portalUrlLabel || 'Portal')}</div>
        <a class="portal-link-url" href="${escapeHtml(portalUrl)}">${escapeHtml(portalUrl)}</a>
      </div>
      <a class="portal-button" href="${escapeHtml(portalUrl)}">${escapeHtml(copy.portalLinkLabel || 'Open portal')}</a>
    </div>

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
      <div class="section-title" style="margin-top:14px;">${escapeHtml(copy.description)}</div>
      <div>${nl2br(description || '-')}</div>
    </div>

    <div class="card">
      <h3 class="section-title">${escapeHtml(copy.nextSteps)}</h3>
      <ul class="list">
        <li>${escapeHtml(copy.nextStep1)}</li>
        <li>${escapeHtml(copy.nextStep2)}</li>
        <li>${escapeHtml(copy.nextStep3)}</li>
      </ul>
    </div>

    <p class="muted">${escapeHtml(copy.registeredAt.replace('{{date}}', formatDateByLanguage(submittedAt, language)))}</p>
  </div>
</div>
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
 * Send reporter notification when the first handler is assigned.
 * @param {Object} ticket - Ticket object
 * @param {Object} options - Additional options
 * @returns {Promise<Object>}
 */
export async function sendReporterAssignmentStartedEmail(ticket, options = {}) {
  const {
    reporterEmail,
    reporterEmailEncrypted,
    reporterName,
    ticketNumber,
    description,
    location,
    emailNotify,
    accessCode,
    severityCode,
    severityLabel,
    workflowType,
    submittedAt,
    statusLabel,
    status,
    statusCode,
    metadata,
    slaResponseHours,
    slaResolutionHours,
    lastUpdateAt,
  } = ticket || {};

  const reporterTarget = getReporterEmailTarget({ reporterEmail, reporterEmailEncrypted });
  if (!emailNotify || !reporterTarget) {
    return { success: false, message: 'Reporter did not opt-in for email notifications' };
  }

  const language = resolveTicketLanguage(ticket);
  const copy = getReporterEmailCopy(language);
  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode, language);
  const currentStatus = getStatusLabel({ metadata, statusLabel, status, statusCode });
  const startedAt = lastUpdateAt || new Date().toISOString();
  const responseHours = Number.isFinite(Number(slaResponseHours)) ? Number(slaResponseHours) : 24;
  const resolutionHours = Number.isFinite(Number(slaResolutionHours)) ? Number(slaResolutionHours) : null;
  const firstResponseDueAt = addHoursSafe(submittedAt || startedAt, responseHours);
  const resolutionDueAt = resolutionHours ? addHoursSafe(submittedAt || startedAt, resolutionHours) : null;
  const assignedHandlers = Array.isArray(options?.assignedHandlers) ? options.assignedHandlers : [];
  const assignedHandlerNames = assignedHandlers
    .map((handler) => String(handler?.name || '').trim())
    .filter(Boolean)
    .join(', ');

  const html = `
${baseStyles}
<h2 class="section-title">${escapeHtml(copy.assignmentStartedTitle)}</h2>
<p class="lead">${escapeHtml(copy.greeting || 'Dear')} ${escapeHtml(reporterName || copy.reporterFallback)},</p>
<p class="lead">${escapeHtml(copy.assignmentStartedIntro)}</p>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.reportOverview)}</h3>
  ${buildMetaTable([
    [copy.ticketNumber, escapeHtml(ticketNumber || '-')],
    [copy.currentStatus, escapeHtml(currentStatus || '-')],
    [copy.severity, `<span class="badge ${severityClassFromCode(severityCode)}">${escapeHtml(safeSeverityLabel)}</span>`],
    [copy.workflow, escapeHtml(workflowType || '-')],
    [copy.location, escapeHtml(location || copy.notProvided)],
    [copy.processingStartedAt, escapeHtml(formatDateByLanguage(startedAt, language))],
  ])}
  ${assignedHandlerNames ? `<p class="muted"><strong>${escapeHtml(copy.assignedHandlers)}:</strong> ${escapeHtml(assignedHandlerNames)}</p>` : ''}
  <div class="section-title" style="margin-top:12px;">${escapeHtml(copy.description)}</div>
  <div>${nl2br(description || '-')}</div>
</div>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.nextSteps)}</h3>
  <p class="muted">${escapeHtml(copy.assignmentStartedSlaHint)}</p>
  ${buildMetaTable([
    [copy.firstResponseBy, escapeHtml(formatDateByLanguage(firstResponseDueAt, language))],
    [copy.resolutionTarget, escapeHtml(formatDateByLanguage(resolutionDueAt, language))],
  ])}
</div>

${accessCode ? `
<div class="callout">
  <strong>${escapeHtml(copy.accessCode)}:</strong> ${escapeHtml(accessCode)}<br/>
  ${escapeHtml(copy.useAccessCode)}
</div>
` : ''}

<p class="muted">${escapeHtml(copy.assignmentStartedFooter)}</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    ...reporterTarget,
    subject: copy.subjectAssignmentStarted.replace('{{ticket}}', ticketNumber || '-'),
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

const HANDLER_NEW_REPORT_COPY = {
  en: {
    title: 'New report available',
    intro: 'A new report was submitted in a workflow you can handle.',
    subject: 'New report available: {{ticket}}',
    details: 'Report details',
    reporter: 'Reporter (if known)',
    portalHint: 'Log in to the portal to review and pick up this report.',
    anonymous: 'Anonymous',
  },
  nl: {
    title: 'Nieuwe melding beschikbaar',
    intro: 'Er is een nieuwe melding ingediend in een workflow die jij kunt behandelen.',
    subject: 'Nieuwe melding beschikbaar: {{ticket}}',
    details: 'Meldingsoverzicht',
    reporter: 'Melder (indien bekend)',
    portalHint: 'Log in op het portaal om deze melding te bekijken en op te pakken.',
    anonymous: 'Anoniem',
  },
  de: {
    title: 'Neue Meldung verfuegbar',
    intro: 'In einem Workflow, den Sie bearbeiten koennen, wurde eine neue Meldung eingereicht.',
    subject: 'Neue Meldung verfuegbar: {{ticket}}',
    details: 'Meldungsuebersicht',
    reporter: 'Hinweisgeber (falls bekannt)',
    portalHint: 'Melden Sie sich im Portal an, um diese Meldung zu uebernehmen.',
    anonymous: 'Anonym',
  },
  fr: {
    title: 'Nouveau signalement disponible',
    intro: 'Un nouveau signalement a ete soumis dans un workflow que vous pouvez traiter.',
    subject: 'Nouveau signalement disponible: {{ticket}}',
    details: 'Apercu du signalement',
    reporter: 'Declarant (si connu)',
    portalHint: 'Connectez-vous au portail pour examiner et prendre en charge ce signalement.',
    anonymous: 'Anonyme',
  },
  pt: {
    title: 'Novo reporte disponivel',
    intro: 'Um novo reporte foi enviado em um fluxo que voce pode tratar.',
    subject: 'Novo reporte disponivel: {{ticket}}',
    details: 'Visao geral do reporte',
    reporter: 'Reportante (se conhecido)',
    portalHint: 'Entre no portal para revisar e assumir este reporte.',
    anonymous: 'Anonimo',
  },
};

const getHandlerNewReportCopy = (language) => {
  const lang = normalizeReporterLanguage(language) || 'en';
  return HANDLER_NEW_REPORT_COPY[lang] || HANDLER_NEW_REPORT_COPY.en;
};

/**
 * Send a handler notification email for a newly submitted report in their workflow
 * @param {Object} ticket - Ticket object
 * @param {Object} handler - Handler object
 * @returns {Promise<Object>}
 */
export async function sendHandlerNewReportEmail(ticket, handler) {
  if (!handler?.email) {
    return { success: false, skipped: true, reason: 'No handler email' };
  }

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

  const language = resolveHandlerLanguage(handler, ticket);
  const copy = getReporterEmailCopy(language);
  const local = getHandlerNewReportCopy(language);
  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode, language);
  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });

  const html = `
${baseStyles}
<h2 class="section-title">${escapeHtml(local.title)}</h2>
<p class="lead">${escapeHtml(copy.greeting || 'Dear')} ${escapeHtml(handler.name || copy.senderHandler || 'colleague')},</p>
<p class="lead">${escapeHtml(local.intro)}</p>

<div class="card">
  <h3 class="section-title">${escapeHtml(local.details)}</h3>
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

<div class="card">
  <h3 class="section-title">${escapeHtml(local.reporter)}</h3>
  ${buildMetaTable([
    [copy.name, escapeHtml(reporterName || local.anonymous)],
    [copy.email, escapeHtml(reporterEmail || copy.notProvided)],
    [copy.phone, escapeHtml(reporterPhone || copy.notProvided)]
  ])}
</div>

<p class="muted">${escapeHtml(local.portalHint)}</p>
`;

  const result = await sendEmail({
    from: 'noreply@nedzink.nl',
    to: handler.email,
    subject: local.subject.replace('{{ticket}}', ticketNumber || '-'),
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
  const fileUrl = toAbsolutePortalUrl(attachment?.fileUrl || attachment?.url || '');

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

  const language = resolveHandlerLanguage(handler, ticket);
  const copy = getReporterEmailCopy(language);
  const statusLabel = getStatusLabel({ metadata, statusLabel: ticket.statusLabel, status: ticket.status, statusCode: ticket.statusCode });
  const safeSeverityLabel = severityLabel || severityLabelFromCode(severityCode, language);
  const safeSenderName = senderName || copy.senderReporter || copy.notProvided;

  const html = `
${baseStyles}
<h2 class="section-title">${escapeHtml(copy.newMessageTitle)}</h2>
<p class="lead">${escapeHtml(copy.greeting || 'Dear')} ${escapeHtml(handler.name || copy.senderHandler)},</p>
<p class="lead">${escapeHtml(copy.handlerMessageIntro || copy.newMessageIntro)}</p>

<div class="card">
  <h3 class="section-title">${escapeHtml(copy.message)}</h3>
  <p><strong>${escapeHtml(copy.from)}:</strong> ${escapeHtml(safeSenderName)}</p>
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
    to: handler.email,
    subject: copy.subjectMessage.replace('{{ticket}}', ticketNumber || '-'),
    html,
    useTemplate: true
  });
  return { success: true, result };
}

export default {
  sendEmail,
  sendReportConfirmationEmail,
  sendHandlerAssignmentEmail,
  sendHandlerNewReportEmail,
  sendReporterAssignmentStartedEmail,
  sendStatusChangeEmail,
  sendHandlerStatusChangeEmail,
  sendAttachmentAddedEmail,
  sendReporterMessageEmail,
  sendHandlerMessageEmail
};

