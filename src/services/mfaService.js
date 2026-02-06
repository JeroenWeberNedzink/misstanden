/**
 * MFA Service (browser-safe) via backend proxy
 */

const MFA_API_URL = '/api/mfa.api.php';

async function postMfa(action, accessToken, extra = {}) {
  const response = await fetch(MFA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      access_token: accessToken,
      ...extra
    })
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) {
    throw new Error(json?.message || 'MFA proxy error');
  }
  return json?.data ?? null;
}

/**
 * Check if user has MFA enrolled by trying to list authenticators
 * @param {string} accessToken - Auth0 MFA access token (with read:authenticators scope)
 * @returns {Promise<boolean>}
 */
export async function checkMFAStatus(accessToken) {
  try {
    const data = await postMfa('check_status', accessToken);
    return !!data?.has_active;
  } catch (error) {
    console.error('Error checking MFA status:', error);
    return false;
  }
}

/**
 * Get all MFA authenticators for current user
 * @param {string} accessToken - Auth0 MFA access token
 * @returns {Promise<Array>}
 */
export async function getMFAAuthenticators(accessToken) {
  try {
    const data = await postMfa('check_status', accessToken);
    return data?.authenticators || [];
  } catch (error) {
    console.error('Error getting MFA authenticators:', error);
    return [];
  }
}

/**
 * Start MFA enrollment (generate QR code)
 * @param {string} accessToken - Auth0 MFA access token (with enroll scope)
 * @returns {Promise<{qrCodeUrl: string, secret: string, authenticatorId: string}>}
 */
export async function startMFAEnrollment(accessToken) {
  try {
    const data = await postMfa('start_enrollment', accessToken);
    const barcodeUri = data?.barcode_uri;
    const qrCodeUrl =
      data?.qr_code ||
      data?.qr_code_url ||
      (barcodeUri
        ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(barcodeUri)}`
        : '');

    return {
      qrCodeUrl,
      secret: data?.secret,
      authenticatorId: data?.id,
      barcodeUri,
    };
  } catch (error) {
    console.error('Error starting MFA enrollment:', error);
    throw error;
  }
}

/**
 * Verify and complete MFA enrollment
 * @param {string} code - 6-digit OTP code
 * @param {string} accessToken - Auth0 MFA access token
 * @returns {Promise<boolean>}
 */
export async function verifyMFAEnrollment(code, accessToken) {
  try {
    await postMfa('verify_enrollment', accessToken, { otp: code });
    return true;
  } catch (error) {
    console.error('Error verifying MFA enrollment:', error);
    return false;
  }
}

/**
 * Delete MFA authenticator (disable 2FA)
 * @param {string} authenticatorId - MFA authenticator ID
 * @param {string} accessToken - Auth0 MFA access token
 * @returns {Promise<boolean>}
 */
export async function deleteMFAAuthenticator(authenticatorId, accessToken) {
  try {
    await postMfa('delete_all', accessToken);
    return true;
  } catch (error) {
    console.error('Error deleting MFA authenticator:', error);
    return false;
  }
}

/**
 * Delete all MFA authenticators for current user
 * @param {string} accessToken - Auth0 MFA access token
 * @returns {Promise<boolean>}
 */
export async function deleteAllMFAAuthenticators(accessToken) {
  try {
    await postMfa('delete_all', accessToken);
    return true;
  } catch (error) {
    console.error('Error deleting all MFA authenticators:', error);
    return false;
  }
}

/**
 * Generate backup/recovery codes
 * @param {number} count - Number of codes to generate (default: 10)
 * @returns {Array<string>}
 */
export function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push(`${code.substring(0, 4)}-${code.substring(4, 8)}`);
  }
  return codes;
}

/**
 * Download backup codes as text file
 * @param {Array<string>} codes - Backup codes array
 * @param {string} filename - File name (default: '2fa-backup-codes.txt')
 */
export function downloadBackupCodes(codes, filename = '2fa-backup-codes.txt') {
  const content = `Two-Factor Authentication Backup Codes\n\nGenerated: ${new Date().toLocaleString()}\n\nKeep these codes in a safe place. Each code can only be used once.\n\n${codes.join('\n')}`;
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy backup codes to clipboard
 * @param {Array<string>} codes - Backup codes array
 * @returns {Promise<boolean>}
 */
export async function copyBackupCodesToClipboard(codes) {
  try {
    await navigator.clipboard.writeText(codes.join('\n'));
    return true;
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    return false;
  }
}
