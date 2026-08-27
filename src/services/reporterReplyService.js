const REPORTER_REPLY_API_URL = '/api/reporter-reply.api.php';
const FILES_API_URL = '/api/files.api.php';

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
    if (!fileMeta?.uploadToken) throw new Error('uploadToken is required');
    return apiPost({
      action: 'add_attachment',
      token: String(token).trim(),
      upload_token: fileMeta.uploadToken,
    });
  },

  async uploadAttachment(token, file, options = {}) {
    if (!token) throw new Error('token is required');
    if (!file) throw new Error('file is required');

    const formData = new FormData();
    formData.append('action', 'upload');
    formData.append('access_mode', 'reply');
    formData.append('reply_token', String(token).trim());
    formData.append('file', file, file.name || 'file');

    const uploadResponse = await fetch(FILES_API_URL, {
      method: 'POST',
      body: formData,
    });
    const uploadJson = await uploadResponse.json().catch(() => null);
    if (!uploadResponse.ok || !uploadJson?.success) {
      throw toError(uploadJson?.message || `Failed to upload attachment (${uploadResponse.status})`, uploadJson);
    }

    const uploadToken = uploadJson?.data?.upload_token || null;

    try {
      const result = await this.addAttachment(token, {
        uploadToken,
      });
      return result;
    } catch (error) {
      try {
        if (uploadToken) {
          await fetch(FILES_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cleanup', upload_token: uploadToken }),
          });
        }
      } catch {
        // Ignore cleanup errors.
      }
      throw error;
    }
  },
};

export default reporterReplyService;
