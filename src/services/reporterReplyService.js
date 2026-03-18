import { supabase } from '../lib/supabase';

const REPORTER_REPLY_API_URL = '/api/reporter-reply.api.php';

const toError = (message, original = null) => {
  const err = new Error(message);
  if (original) err.original = original;
  return err;
};

const apiPost = async (payload) => {
  const resp = await fetch(REPORTER_REPLY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok || !json?.success) {
    throw toError(json?.message || `Reporter reply API error (${resp.status})`, json);
  }
  return json?.data || {};
};

const safeFileName = (rawName = 'file') => String(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');

const randomId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

export const reporterReplyService = {
  async validateToken(token) {
    if (!token) throw new Error('token is required');
    return apiPost({ action: 'validate_token', token: String(token).trim() });
  },

  async getThread(token) {
    if (!token) throw new Error('token is required');
    return apiPost({ action: 'fetch_messages', token: String(token).trim() });
  },

  async sendMessage(token, body) {
    if (!token) throw new Error('token is required');
    if (!body || !String(body).trim()) throw new Error('body is required');
    return apiPost({
      action: 'send_message',
      token: String(token).trim(),
      body: String(body).trim(),
    });
  },

  async addAttachment(token, fileMeta = {}) {
    if (!token) throw new Error('token is required');
    if (!fileMeta?.name || !fileMeta?.url) throw new Error('fileMeta.name and fileMeta.url are required');
    return apiPost({
      action: 'add_attachment',
      token: String(token).trim(),
      file_name: fileMeta.name,
      file_url: fileMeta.url,
      mime_type: fileMeta.type || 'application/octet-stream',
      size_bytes: Number(fileMeta.size || 0) || 0,
    });
  },

  async uploadAttachment(token, file, options = {}) {
    if (!token) throw new Error('token is required');
    if (!file) throw new Error('file is required');

    const bucket = options?.bucket || 'attachments';
    const uid = randomId();
    const path = `reporter-replies/${uid}_${safeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
    if (uploadError) {
      throw toError(`Failed to upload attachment: ${uploadError.message}`, uploadError);
    }

    try {
      const result = await this.addAttachment(token, {
        name: file.name,
        url: path,
        type: file.type || 'application/octet-stream',
        size: file.size || 0,
      });
      return result;
    } catch (error) {
      try {
        await supabase.storage.from(bucket).remove([path]);
      } catch {
        // Ignore cleanup errors.
      }
      throw error;
    }
  },
};

export default reporterReplyService;
