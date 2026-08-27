#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// Ephemeral test-only secrets. Production/runtime code still fails closed when
// the dedicated server-side variables are absent or too short.
if (!process.env.ATTACHMENT_TOKEN_KEY) process.env.ATTACHMENT_TOKEN_KEY = randomBytes(32).toString('hex');
if (!process.env.PORTAL_TOKEN_HASH_KEY) process.env.PORTAL_TOKEN_HASH_KEY = randomBytes(32).toString('hex');

const root = process.cwd();
const defaultBaseUrl = process.env.API_TEST_BASE_URL || 'http://127.0.0.1:8081';
const args = new Map();
const flags = new Set();

for (const raw of process.argv.slice(2)) {
  if (raw.startsWith('--') && raw.includes('=')) {
    const [key, ...rest] = raw.slice(2).split('=');
    args.set(key, rest.join('='));
  } else if (raw.startsWith('--')) {
    flags.add(raw.slice(2));
  }
}

const config = {
  baseUrl: normalizeBaseUrl(args.get('base-url') || defaultBaseUrl),
  startServer: flags.has('start-server') || process.env.API_TEST_START_SERVER === '1',
  mutate: flags.has('mutate') || process.env.API_TEST_MUTATE === '1',
  performance: flags.has('performance') || process.env.API_TEST_PERFORMANCE === '1',
  authToken: args.get('auth-token') || process.env.API_TEST_AUTH_TOKEN || '',
  timeoutMs: Number(args.get('timeout-ms') || process.env.API_TEST_TIMEOUT_MS || 15000),
  iterations: Number(args.get('iterations') || process.env.API_TEST_ITERATIONS || 3),
  warnMs: Number(args.get('warn-ms') || process.env.API_TEST_WARN_MS || 1200),
  failMs: Number(args.get('fail-ms') || process.env.API_TEST_FAIL_MS || 5000),
  skipLint: flags.has('skip-lint'),
  json: flags.has('json'),
};

const results = [];
const timings = [];
let serverProcess = null;
let sharedState = {
  workflows: [],
  severities: [],
  locations: [],
  createdTicket: null,
  authzAvailable: false,
};

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function apiPath(file, query = '') {
  return `/api/${file}${query ? `?${query}` : ''}`;
}

function urlFor(file, query = '') {
  return `${config.baseUrl}${apiPath(file, query)}`;
}

function record(status, name, detail = '', extra = {}) {
  results.push({ status, name, detail, ...extra });
  if (!config.json) {
    const mark = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : 'FAIL';
    const suffix = detail ? ` - ${detail}` : '';
    console.log(`${mark} ${name}${suffix}`);
  }
}

function pass(name, detail = '', extra = {}) {
  record('pass', name, detail, extra);
}

function fail(name, detail = '', extra = {}) {
  record('fail', name, detail, extra);
}

function skip(name, detail = '', extra = {}) {
  record('skip', name, detail, extra);
}

function discoverPhpFiles() {
  const candidates = [];
  for (const dir of ['public/api', 'scripts', 'run']) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    walk(abs, (file) => {
      if (!file.endsWith('.php')) return;
      if (file.includes(`${path.sep}public${path.sep}api${path.sep}src${path.sep}`)) return;
      candidates.push(path.relative(root, file));
    });
  }
  return candidates.sort();
}

function discoverApiEndpoints() {
  const apiDir = path.join(root, 'public', 'api');
  return fs.readdirSync(apiDir)
    .filter((file) => file.endsWith('.api.php'))
    .sort();
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor' || entry.name === 'node_modules') continue;
      walk(abs, visit);
    } else {
      visit(abs);
    }
  }
}

function runPhpLint() {
  if (config.skipLint) {
    skip('php lint', 'disabled with --skip-lint');
    return;
  }

  const files = discoverPhpFiles();
  if (!files.length) {
    fail('php lint', 'no PHP files found');
    return;
  }

  let failed = 0;
  for (const file of files) {
    const result = spawnSync('php', ['-l', file], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status !== 0) {
      failed += 1;
      fail(`php lint ${file}`, (result.stderr || result.stdout || '').trim());
    }
  }

  if (failed === 0) {
    pass('php lint', `${files.length} files`);
  }
}

function runFeatureContractChecks() {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const checks = [
    ['anonymous explanation conditional UI',
      read('src/pages/anonymous-report-form/components/ReporterContactFields.jsx').includes('isAnonymous &&')
        && read('src/pages/anonymous-report-form/components/AnonymousReportingNotice.jsx').includes('anonymousInfo.technicalData')],
    ['anonymous identity stripped server-side',
      read('public/api/tickets.api.php').includes("ticket_crypto_encrypt_nullable($isAnonymous ? null : ($data['reporter_name']")
        && read('public/api/tickets.api.php').includes("unset($metadata['reporter_meta_client']")],
    ['reporter reminders assignment and terminal stop conditions',
      read('public/api/reporter-reminders.api.php').includes('NOT EXISTS (SELECT 1 FROM dbo.ticket_handlers')
        && read('public/api/reporter-reminders.api.php').includes('COALESCE(ws.is_terminal, 0) = 0')],
    ['reporter reminders preferences and safe email eligibility',
      read('public/api/reporter-reminders.api.php').includes('t.email_notify = 1 AND t.status_email_notify = 1')
        && read('public/api/reporter-reminders.api.php').includes('t.reporter_email_encrypted IS NOT NULL')],
    ['reporter reminder duplicate prevention',
      read('scripts/sqlserver/bootstrap-schema.sql').includes('UX_reporter_reminder_ticket_type')
        && read('public/api/reporter-reminders.api.php').includes("SET status = N'sent'")],
    ['anonymous reminder model preserved',
      !read('public/api/reporter-reminders.api.php').includes('t.is_anonymous = 0')],
    ['completed attachment remains status-neutral and audited',
      read('public/api/tickets.api.php').includes('ticket_require_handler_ticket_access($handler, $ticketId)')
        && read('public/api/tickets.api.php').includes("'action_type' => 'attachment_added'")
        && read('public/api/tickets.api.php').includes('Attachment upload unexpectedly changed ticket status')],
    ['note and message immediate pending state',
      read('src/pages/case-management-detail/index.jsx').includes("createPendingId('pending-note')")
        && read('src/pages/case-management-detail/index.jsx').includes("createPendingId('pending-message')")],
    ['duplicate note and message submission prevented',
      read('src/pages/case-management-detail/components/InvestigationNotesPanel.jsx').includes('isSubmitting || !newNote?.trim()')
        && read('src/pages/case-management-detail/components/CommunicationPanel.jsx').includes('isSubmitting || !messageText?.trim()')],
    ['pending state removed on mutation failure',
      read('src/pages/case-management-detail/index.jsx').includes('filter((note) => note?.id !== pendingId)')
        && read('src/pages/case-management-detail/index.jsx').includes('filter((message) => message?.id !== pendingId)')],
    ['handler message response preserves reporter visibility timestamp',
      read('public/api/tickets.api.php').includes("'visible_at' => ticket_handler_message_visible_at($isInternal, $sender)")
        && read('public/api/tickets.api.php').includes("WHERE id = @id")],
    ['raw attachment paths cannot authorize file operations',
      !read('public/api/files.api.php').includes("$_GET['path']")
        && !read('public/api/files.api.php').includes("$payload['path']")
        && read('public/api/files.api.php').includes('attachment_security_validate_download')],
    ['attachment upload is ticket-authorized before storage',
      read('public/api/files.api.php').includes('files_authorize_upload();')
        && read('public/api/files.api.php').indexOf('files_authorize_upload();') < read('public/api/files.api.php').indexOf('move_uploaded_file')],
    ['attachment downloads are opaque scoped and time limited',
      read('public/api/_attachment_security.php').includes("'k' => 'download'")
        && read('public/api/_attachment_security.php').includes('aes-256-gcm')
        && read('public/api/_attachment_security.php').includes("hash_hmac('sha256', $message")
        && read('public/api/_attachment_security.php').includes('hash_equals($expectedSignature, $providedSignature)')
        && read('public/api/_attachment_security.php').includes('ATTACHMENT_SECURITY_PUBLIC_SCOPES')],
    ['new reporter secrets use one-way keyed hashes',
      read('public/api/tickets.api.php').includes("portal_token_hash('ticket-access-code'")
        && read('public/api/tickets.api.php').includes("portal_token_hash('ticket-reply-token'")
        && read('public/api/reporter-reply.api.php').includes('token_hash')],
    ['attachment and portal token keys are separated from email encryption',
      read('public/api/_attachment_security.php').includes("getenv('ATTACHMENT_TOKEN_KEY')")
        && !read('public/api/_attachment_security.php').includes('get_email_crypto_key')
        && read('public/api/_portal_tokens.php').includes("getenv('PORTAL_TOKEN_HASH_KEY')")
        && !read('public/api/_portal_tokens.php').includes('get_email_crypto_key')],
    ['attachment deletion is authorized and audited',
      read('public/api/files.api.php').includes('files_require_handler_ticket($handler, $ticketId)')
        && read('public/api/files.api.php').includes("N'attachment_deleted'")],
    ['IIS blocks direct private storage access',
      read('public/web.config').includes('<add segment="private" />')
        && read('private/web.config').includes('<add segment="uploads" />')],
    ['IIS deploy preserves server-owned keys and uploads',
      read('nz-startup.ps1').includes("Invoke-RobocopyChecked $privateDir $targetPrivateDir @('web.config')")
        && !read('nz-startup.ps1').includes("Invoke-RobocopyChecked $privateDir $targetPrivateDir @('*') @('/MIR'")
        && !read('nz-startup.ps1').includes("@('.env', '.env.local', 'cacert.pem')")
        && read('nz-startup.ps1').includes("$targetAttachmentDir = Join-Path $targetPrivateDir 'uploads\\attachments'")
        && read('nz-startup.ps1').includes("icacls.exe $path '/inheritance:d'")
        && read('nz-startup.ps1').includes("'*S-1-1-0' '*S-1-5-11' '*S-1-5-32-545' '*S-1-3-0'")
        && read('nz-startup.ps1').includes('Grant-IisModifyAccess $targetAttachmentDir $true')
        && !read('nz-startup.ps1').includes('Grant-IisModifyAccess $targetUploadDir')],
  ];

  for (const [name, ok] of checks) {
    if (ok) pass(name);
    else fail(name, 'feature contract not found in implementation');
  }

  const securityResult = spawnSync('php', ['scripts/attachment-security-test.php'], { cwd: root, encoding: 'utf8', windowsHide: true });
  try {
    const report = JSON.parse(String(securityResult.stdout || '').trim());
    for (const item of report?.results || []) {
      if (item?.ok) pass(`attachment security: ${item.name}`);
      else fail(`attachment security: ${item?.name || 'unknown check'}`);
    }
    if (securityResult.status !== 0 && report?.success !== false) fail('attachment security test process', `exit ${securityResult.status}`);
  } catch {
    fail('attachment security test process', truncate(securityResult.stderr || securityResult.stdout || 'invalid test output'));
  }
}

async function maybeStartServer() {
  if (await isServerReachable()) {
    pass('api server reachable', config.baseUrl);
    return;
  }

  if (!config.startServer) {
    fail('api server reachable', `${config.baseUrl} is not responding. Start .\\nz-startup.ps1 or rerun with --start-server.`);
    return;
  }

  const publicRoot = path.join(root, 'public');
  serverProcess = spawn('php', ['-S', '127.0.0.1:8081', '-t', publicRoot], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout.on('data', () => {});
  serverProcess.stderr.on('data', () => {});

  for (let i = 0; i < 40; i += 1) {
    await wait(250);
    if (await isServerReachable()) {
      pass('api server started', config.baseUrl);
      return;
    }
  }
  fail('api server started', 'PHP built-in server did not become reachable');
}

async function isServerReachable() {
  try {
    const response = await fetchWithTimeout(`${config.baseUrl}/api/settings.api.php`, { method: 'OPTIONS' }, 3000);
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = config.timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function request(name, file, {
  method = 'GET',
  query = '',
  body,
  auth = false,
  expectedStatuses = [200],
  expectSuccess,
  expectJson = true,
  validate,
  timeoutMs,
} = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && config.authToken) headers.Authorization = `Bearer ${config.authToken}`;

  const start = performance.now();
  let response;
  let text = '';
  let json = null;
  try {
    response = await fetchWithTimeout(urlFor(file, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }, timeoutMs || config.timeoutMs);
    text = await response.text();
    if (text.trim() !== '') {
      try {
        json = JSON.parse(text);
      } catch {}
    }
  } catch (error) {
    fail(name, error?.name === 'AbortError' ? `timeout after ${timeoutMs || config.timeoutMs}ms` : error.message);
    return { ok: false, response: null, json: null, ms: performance.now() - start };
  }

  const ms = performance.now() - start;
  timings.push({ name, file, method, status: response.status, ms });

  if (!expectedStatuses.includes(response.status)) {
    fail(name, `HTTP ${response.status}, expected ${expectedStatuses.join('/')}${text ? `, body: ${truncate(text)}` : ''}`, { ms });
    return { ok: false, response, json, ms };
  }

  if (expectJson && !json) {
    fail(name, `response was not JSON: ${truncate(text)}`, { ms });
    return { ok: false, response, json, ms };
  }

  if (typeof expectSuccess === 'boolean' && Boolean(json?.success) !== expectSuccess) {
    fail(name, `success=${json?.success}, expected ${expectSuccess}${json?.message ? ` (${json.message})` : ''}`, { ms });
    return { ok: false, response, json, ms };
  }

  if (validate) {
    const validation = validate(json, response);
    if (validation !== true) {
      fail(name, String(validation || 'validation failed'), { ms });
      return { ok: false, response, json, ms };
    }
  }

  pass(name, `${response.status} in ${Math.round(ms)}ms`, { ms });
  return { ok: true, response, json, ms };
}

function truncate(value, max = 240) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

async function runOptionsSmoke() {
  for (const endpoint of discoverApiEndpoints()) {
    await request(`OPTIONS ${endpoint}`, endpoint, {
      method: 'OPTIONS',
      expectedStatuses: [200, 204],
      expectJson: false,
    });
  }
}

async function runPublicReadSmoke() {
  const settings = await request('GET settings public', 'settings.api.php', {
    expectedStatuses: [200],
    expectSuccess: true,
    validate: (json) => Array.isArray(json?.data?.rows) || 'data.rows is not an array',
  });

  const workflows = await request('GET catalog workflows', 'catalog.api.php', {
    query: 'action=workflows&include_inactive=1',
    expectedStatuses: [200],
    expectSuccess: true,
    validate: (json) => Array.isArray(json?.data?.rows) || 'data.rows is not an array',
  });
  sharedState.workflows = workflows.json?.data?.rows || [];

  await request('GET catalog dashboard catalog', 'catalog.api.php', {
    query: 'action=handler_dashboard_catalog&include_inactive=1',
    expectedStatuses: [200],
    expectSuccess: true,
    validate: (json) => Array.isArray(json?.data?.workflows) || 'data.workflows is not an array',
  });

  const locations = await request('GET catalog locations', 'catalog.api.php', {
    query: 'action=locations&include_inactive=1',
    expectedStatuses: [200],
    expectSuccess: true,
    validate: (json) => Array.isArray(json?.data?.rows) || 'data.rows is not an array',
  });
  sharedState.locations = locations.json?.data?.rows || [];

  const severities = await request('GET catalog severities', 'catalog.api.php', {
    query: 'action=severities',
    expectedStatuses: [200],
    expectSuccess: true,
    validate: (json) => Array.isArray(json?.data?.rows) || 'data.rows is not an array',
  });
  sharedState.severities = severities.json?.data?.rows || [];

  await request('POST tickets unsupported action contract', 'tickets.api.php', {
    method: 'POST',
    body: { action: '__smoke_unknown__' },
    expectedStatuses: [400],
    expectSuccess: false,
  });

  return settings.ok && workflows.ok && locations.ok && severities.ok;
}

async function runProtectedContractSmoke() {
  if (config.authToken) {
    const me = await request('GET me context authenticated', 'me.api.php', {
      auth: true,
      expectedStatuses: [200, 403],
      expectJson: true,
    });
    sharedState.authzAvailable = me.ok && me.response?.status === 200;
    if (!sharedState.authzAvailable) {
      skip('protected authorization performance', 'API token is valid, but it is not linked to an active handler/admin account');
    }
  } else {
    await request('GET me context auth guard', 'me.api.php', {
      expectedStatuses: [401, 403],
      expectSuccess: false,
    });
  }

  const protectedReads = [
    ['GET handler dashboard', 'handler-dashboard.api.php', 'summary=1'],
    ['GET ticket read list', 'ticket-read.api.php', 'action=list&summary=1'],
    ['GET analytics', 'analytics.api.php', ''],
    ['GET workflows stats', 'workflows.api.php', 'action=list_with_stats'],
    ['GET translations languages', 'translations.api.php', 'action=languages'],
    ['GET security self-test', 'security-self-test.api.php', ''],
    ['GET email event types', 'email-settings.api.php', 'action=event_types'],
  ];

  for (const [name, file, query] of protectedReads) {
    if (config.authToken) {
      await request(`${name} authenticated`, file, {
        query,
        auth: true,
        expectedStatuses: [200, 403],
        expectJson: true,
      });
    } else {
      await request(`${name} auth guard`, file, {
        query,
        expectedStatuses: [401, 403],
        expectSuccess: false,
      });
    }
  }

  await request('POST email verification auth guard', 'email-verification.api.php', {
    method: 'POST',
    body: { action: 'status' },
    expectedStatuses: config.authToken ? [200, 401, 403, 500] : [401],
    auth: Boolean(config.authToken),
    expectJson: true,
  });

  if (!config.authToken) {
    await request('POST reporter reminders auth guard', 'reporter-reminders.api.php', {
      method: 'POST',
      body: {},
      expectedStatuses: [401, 403],
      expectSuccess: false,
    });
    await request('GET raw attachment path rejected', 'files.api.php', {
      query: 'action=download&path=../../.env', expectedStatuses: [401], expectSuccess: false,
    });
    await request('GET invalid signed attachment rejected', 'files.api.php', {
      query: 'action=download&token=v1.invalid', expectedStatuses: [401], expectSuccess: false,
    });
    await request('POST unauthorized attachment sign rejected', 'files.api.php', {
      method: 'POST', body: { action: 'sign', attachment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, expectedStatuses: [401], expectSuccess: false,
    });
    await request('POST unauthorized attachment upload rejected', 'files.api.php', {
      method: 'POST', body: { action: 'upload', ticket_id: '11111111-1111-4111-8111-111111111111' }, expectedStatuses: [401], expectSuccess: false,
    });
    await request('POST unauthorized attachment delete rejected', 'files.api.php', {
      method: 'POST', body: { action: 'delete', attachment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, expectedStatuses: [401], expectSuccess: false,
    });
  }
}

async function runMutationSmoke() {
  if (!config.mutate) {
    skip('mutation smoke', 'disabled; rerun with --mutate to create a disposable ticket');
    return;
  }

  const workflow = sharedState.workflows.find((item) => item?.code) || null;
  if (!workflow) {
    fail('mutation smoke', 'no workflow with code was available for ticket creation');
    return;
  }

  const severity = sharedState.severities.find((item) => item?.code)?.code || 'low';
  const unique = Date.now();
  const create = await request('POST tickets create disposable', 'tickets.api.php', {
    method: 'POST',
    body: {
      action: 'create',
      workflow_type: workflow.code,
      severity_code: severity,
      description: `API smoke test disposable report ${unique}`,
      location: 'API smoke test',
      reporter_name: 'API Smoke Test',
      reporter_email: `api-smoke-${unique}@example.test`,
      reporter_phone: '+31000000000',
      is_anonymous: true,
      email_notify: false,
      status_email_notify: false,
      metadata: {
        source: 'api-backend-test',
        disposable: true,
        created_at: new Date().toISOString(),
        reporter_meta_client: { user_agent: 'must-not-be-stored-for-anonymous-reports' },
      },
    },
    expectedStatuses: [200],
    expectSuccess: true,
    timeoutMs: Math.max(config.timeoutMs, 30000),
    validate: (json) => {
      const data = json?.data || {};
      if (!data.id || !data.ticket_number || !data.access_code) return 'ticket id, ticket_number, or access_code missing';
      if (data.description?.includes('API smoke test') !== true) return 'created ticket description was not returned decrypted';
      if (data.reporter_name || data.reporter_phone) return 'anonymous ticket retained reporter name or phone';
      if (data.metadata?.reporter_meta_client || data.metadata?.reporterMetaClient) return 'anonymous ticket retained browser/device metadata';
      return true;
    },
  });

  if (!create.ok) return;
  sharedState.createdTicket = create.json.data;

  const storageCheck = spawnSync('php', ['scripts/attachment-security-test.php'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, SECURITY_TEST_TICKET_ID: sharedState.createdTicket.id },
  });
  try {
    const report = JSON.parse(String(storageCheck.stdout || '').trim());
    for (const item of (report?.results || []).filter((entry) => entry?.name?.startsWith('new '))) {
      if (item.ok) pass(`attachment security: ${item.name}`);
      else fail(`attachment security: ${item.name}`);
    }
  } catch {
    fail('new reporter token storage verification', truncate(storageCheck.stderr || storageCheck.stdout));
  }

  await request('POST tickets access disposable', 'tickets.api.php', {
    method: 'POST',
    body: {
      action: 'access',
      ticket_input: sharedState.createdTicket.ticket_number,
      access_code: sharedState.createdTicket.access_code,
    },
    expectedStatuses: [200],
    expectSuccess: true,
    validate: (json) => {
      const data = json?.data || {};
      if (data.access_code || data.reporter_email || data.reporter_email_encrypted) {
        return 'reporter-facing response leaked sensitive ticket fields';
      }
      return true;
    },
  });

  await request('POST tickets reporter message disposable', 'tickets.api.php', {
    method: 'POST',
    body: {
      action: 'message',
      ticket_input: sharedState.createdTicket.ticket_number,
      access_code: sharedState.createdTicket.access_code,
      body: `Reporter reply from API smoke test ${unique}`,
    },
    expectedStatuses: [200],
    expectSuccess: true,
    validate: (json) => json?.data?.message?.body ? true : 'message body missing in response',
  });

  const uploadForm = new FormData();
  uploadForm.append('action', 'upload');
  uploadForm.append('access_mode', 'reporter');
  uploadForm.append('ticket_id', sharedState.createdTicket.id);
  uploadForm.append('ticket_input', sharedState.createdTicket.ticket_number);
  uploadForm.append('access_code', sharedState.createdTicket.access_code);
  uploadForm.append('file', new Blob(['%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'], { type: 'application/pdf' }), 'security-smoke.pdf');
  let uploadJson = null;
  try {
    const uploadResponse = await fetchWithTimeout(urlFor('files.api.php'), { method: 'POST', body: uploadForm }, config.timeoutMs);
    uploadJson = await uploadResponse.json().catch(() => null);
    if (uploadResponse.status === 200 && uploadJson?.success && uploadJson?.data?.upload_token && !uploadJson?.data?.path) {
      pass('POST reporter authorized attachment upload', '200 with opaque upload token');
    } else {
      fail('POST reporter authorized attachment upload', `HTTP ${uploadResponse.status}: ${truncate(JSON.stringify(uploadJson))}`);
    }
  } catch (error) {
    fail('POST reporter authorized attachment upload', error.message);
  }

  if (uploadJson?.data?.upload_token) {
    const attached = await request('POST reporter attach authorized upload', 'tickets.api.php', {
      method: 'POST',
      body: {
        action: 'reporter_add_attachment', ticket_input: sharedState.createdTicket.ticket_number,
        access_code: sharedState.createdTicket.access_code, upload_token: uploadJson.data.upload_token,
      },
      expectedStatuses: [200], expectSuccess: true,
      validate: (json) => {
        const url = json?.data?.attachment?.file_url || '';
        if (!url.includes('action=download') || !url.includes('token=v1.')) return 'short-lived download URL missing';
        if (url.includes('path=')) return 'storage path leaked in download URL';
        return true;
      },
    });
    const signedUrl = attached.json?.data?.attachment?.file_url;
    if (signedUrl) {
      const response = await fetchWithTimeout(`${config.baseUrl}${signedUrl}`, {}, config.timeoutMs);
      if (response.status === 200 && (await response.text()).startsWith('%PDF-1.4')) pass('GET reporter own signed attachment', '200');
      else fail('GET reporter own signed attachment', `HTTP ${response.status}`);
      const modified = `${signedUrl.slice(0, -1)}${signedUrl.endsWith('A') ? 'B' : 'A'}`;
      const modifiedResponse = await fetchWithTimeout(`${config.baseUrl}${modified}`, {}, config.timeoutMs);
      if (modifiedResponse.status === 401) pass('GET modified attachment token rejected', '401');
      else fail('GET modified attachment token rejected', `HTTP ${modifiedResponse.status}`);
    }

    await request('POST reporter cross-ticket attachment rejected', 'tickets.api.php', {
      method: 'POST',
      body: { action: 'reporter_add_attachment', ticket_input: '22222222-2222-4222-8222-222222222222', access_code: sharedState.createdTicket.access_code, upload_token: uploadJson.data.upload_token },
      expectedStatuses: [401], expectSuccess: false,
    });
  }

  if (config.authToken) {
    const expectedStatuses = sharedState.authzAvailable ? [200] : [403];
    await request('GET ticket-read disposable with relations', 'ticket-read.api.php', {
      query: `action=get&include_relations=1&ticket_id=${encodeURIComponent(sharedState.createdTicket.id)}`,
      auth: true,
      expectedStatuses,
      expectJson: true,
    });
  }
}

async function runPerformanceSmoke() {
  if (!config.performance) {
    skip('performance smoke', 'disabled; rerun with --performance');
    return;
  }

  const targets = [
    ['settings public', 'settings.api.php', ''],
    ['catalog workflows', 'catalog.api.php', 'action=workflows&include_inactive=1'],
    ['catalog dashboard catalog', 'catalog.api.php', 'action=handler_dashboard_catalog&include_inactive=1'],
    ['catalog locations', 'catalog.api.php', 'action=locations&include_inactive=1'],
    ['catalog severities', 'catalog.api.php', 'action=severities'],
  ];

  if (config.authToken && sharedState.authzAvailable) {
    targets.push(['workflows stats authenticated', 'workflows.api.php', 'action=list_with_stats&limit=25']);
    targets.push(['ticket list summary authenticated', 'ticket-read.api.php', 'action=list&summary=1']);
    targets.push(['analytics authenticated', 'analytics.api.php', '']);
  } else if (config.authToken && !sharedState.authzAvailable) {
    skip('authenticated performance probes', 'token is not linked to an active handler/admin account');
  }

  for (const [name, file, query] of targets) {
    const samples = [];
    let failedRequest = false;
    for (let i = 0; i < config.iterations; i += 1) {
      const result = await request(`PERF ${name} #${i + 1}`, file, {
        query,
        auth: name.includes('authenticated'),
        expectedStatuses: [200],
        expectJson: true,
        timeoutMs: Math.max(config.timeoutMs, config.failMs + 1000),
      });
      if (!result.ok) {
        failedRequest = true;
        break;
      }
      samples.push(result.ms);
    }
    if (failedRequest || samples.length === 0) continue;

    const sorted = samples.slice().sort((a, b) => a - b);
    const avg = samples.reduce((sum, ms) => sum + ms, 0) / samples.length;
    const max = Math.max(...samples);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] || max;
    const detail = `avg ${Math.round(avg)}ms, p95 ${Math.round(p95)}ms, max ${Math.round(max)}ms`;
    if (max > config.failMs) {
      fail(`PERF threshold ${name}`, `${detail}; max exceeded ${config.failMs}ms`);
    } else if (p95 > config.warnMs) {
      pass(`PERF threshold ${name}`, `${detail}; warning threshold ${config.warnMs}ms exceeded`);
    } else {
      pass(`PERF threshold ${name}`, detail);
    }
  }
}

function printSummary() {
  const counts = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const failed = counts.fail || 0;

  const slowest = timings
    .slice()
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8)
    .map((item) => ({
      name: item.name,
      status: item.status,
      ms: Math.round(item.ms),
    }));

  if (config.json) {
    console.log(JSON.stringify({
      success: failed === 0,
      baseUrl: config.baseUrl,
      counts,
      slowest,
      results,
    }, null, 2));
    return;
  }

  console.log('');
  console.log(`Summary: ${counts.pass || 0} passed, ${counts.skip || 0} skipped, ${failed} failed`);
  if (slowest.length) {
    console.log('Slowest requests:');
    for (const item of slowest) {
      console.log(`- ${item.ms}ms ${item.status} ${item.name}`);
    }
  }
}

async function main() {
  try {
    runPhpLint();
    runFeatureContractChecks();
    await maybeStartServer();
    if (results.some((item) => item.name === 'api server reachable' && item.status === 'fail')
      || results.some((item) => item.name === 'api server started' && item.status === 'fail')) {
      return;
    }

    await runOptionsSmoke();
    await runPublicReadSmoke();
    await runProtectedContractSmoke();
    await runMutationSmoke();
    await runPerformanceSmoke();
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
    printSummary();
    const failed = results.some((item) => item.status === 'fail');
    process.exitCode = failed ? 1 : 0;
  }
}

main().catch((error) => {
  fail('test runner crashed', error?.stack || error?.message || String(error));
  printSummary();
  if (serverProcess) serverProcess.kill();
  process.exitCode = 1;
});
