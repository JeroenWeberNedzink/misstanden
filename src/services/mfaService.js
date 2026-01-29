/**
 * MFA Service for Auth0 Multi-Factor Authentication
 * Handles enrollment, verification, and management of 2FA
 */

const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN || 'nedzinkbv.eu.auth0.com';

/**
 * Check if user has MFA enrolled by trying to list authenticators
 * @param {string} accessToken - Auth0 MFA access token (with read:authenticators scope)
 * @returns {Promise<boolean>}
 */
export async function checkMFAStatus(accessToken) {
  try {
    const response = await fetch(`https://${AUTH0_DOMAIN}/mfa/authenticators`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const authenticators = await response.json();
      // Check if user has any confirmed authenticators
      return authenticators.some(auth => auth.active);
    }

    return false;
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
    const response = await fetch(`https://${AUTH0_DOMAIN}/mfa/authenticators`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      return await response.json();
    }

    return [];
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
    const response = await fetch(`https://${AUTH0_DOMAIN}/mfa/associate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        authenticator_types: ['otp'],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('MFA enrollment error:', errorData);
      throw new Error(errorData.error_description || 'Failed to start MFA enrollment');
    }

    const data = await response.json();
    return {
      qrCodeUrl: data.barcode_uri,
      secret: data.secret,
      authenticatorId: data.id,
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
    const response = await fetch(`https://${AUTH0_DOMAIN}/mfa/associate`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        otp: code,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('MFA verification error:', errorData);
      return false;
    }

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
    const response = await fetch(`https://${AUTH0_DOMAIN}/mfa/authenticators/${authenticatorId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('MFA deletion error:', errorData);
      return false;
    }

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
    const authenticators = await getMFAAuthenticators(accessToken);

    for (const authenticator of authenticators) {
      await deleteMFAAuthenticator(authenticator.id, accessToken);
    }

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
