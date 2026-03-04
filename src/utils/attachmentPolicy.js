const DEFAULT_ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
const DEFAULT_MAX_MB = 10;

const EXTENSION_MIME_MAP = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  gif: ['image/gif'],
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/csv', 'text/comma-separated-values'],
  zip: ['application/zip', 'application/x-zip-compressed'],
};

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'ja', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'nee', 'off'].includes(normalized)) return false;
  return fallback;
};

const normalizeExtensions = (value) => {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').map((part) => part.trim())
      : [];

  const normalized = Array.from(
    new Set(
      raw
        .map((entry) => String(entry || '').trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean)
    )
  );

  return normalized.length > 0 ? normalized : [...DEFAULT_ALLOWED_EXTENSIONS];
};

const extensionFromFileName = (name) => {
  const safe = String(name || '').trim().toLowerCase();
  if (!safe.includes('.')) return '';
  return safe.split('.').pop() || '';
};

export const buildAttachmentPolicy = (portalSettings = {}) => {
  const maxMbRaw = Number(portalSettings?.maxAttachmentSizeMb);
  const maxAttachmentSizeMb =
    Number.isFinite(maxMbRaw) && maxMbRaw > 0
      ? Math.min(Math.max(Math.floor(maxMbRaw), 1), 250)
      : DEFAULT_MAX_MB;

  const allowedExtensions = normalizeExtensions(portalSettings?.allowedFileTypes);
  const allowedMimeTypes = new Set(
    allowedExtensions.flatMap((ext) => EXTENSION_MIME_MAP[ext] || [])
  );

  return {
    attachmentsEnabled: toBoolean(portalSettings?.enableAttachments, true),
    maxAttachmentSizeMb,
    maxAttachmentBytes: maxAttachmentSizeMb * 1024 * 1024,
    allowedExtensions,
    allowedMimeTypes,
    accept: allowedExtensions.map((ext) => `.${ext}`).join(','),
  };
};

export const validateAttachmentSelection = (files = [], policy) => {
  const effectivePolicy = policy || buildAttachmentPolicy({});
  const normalizedFiles = Array.isArray(files) ? files : [];
  const validFiles = [];
  const errors = [];

  for (const file of normalizedFiles) {
    const fileName = String(file?.name || 'file');
    if (!effectivePolicy.attachmentsEnabled) {
      errors.push({ file, fileName, reason: 'disabled' });
      continue;
    }

    const extension = extensionFromFileName(fileName);
    const mimeType = String(file?.type || '').trim().toLowerCase();

    const extensionAllowed = extension !== '' && effectivePolicy.allowedExtensions.includes(extension);
    const mimeAllowed = mimeType !== '' && effectivePolicy.allowedMimeTypes.has(mimeType);

    if (!extensionAllowed && !mimeAllowed) {
      errors.push({ file, fileName, reason: 'type' });
      continue;
    }

    const size = Number(file?.size || 0);
    if (Number.isFinite(size) && size > effectivePolicy.maxAttachmentBytes) {
      errors.push({ file, fileName, reason: 'size' });
      continue;
    }

    validFiles.push(file);
  }

  return { validFiles, errors };
};
