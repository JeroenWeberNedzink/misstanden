const EMAIL_VERIFICATION_API_URL = '/api/email-verification.api.php';

const postEmailVerification = async (action, accessToken) => {
  const response = await fetch(EMAIL_VERIFICATION_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const suffix = payload?.data?.error_id ? ` (ref: ${payload.data.error_id})` : '';
    throw new Error((payload?.message || 'Email verification request failed') + suffix);
  }

  return payload?.data || {};
};

export const emailVerificationService = {
  async getStatus(accessToken) {
    const data = await postEmailVerification('status', accessToken);
    return {
      email: data?.email || '',
      emailVerified: Boolean(data?.email_verified),
      updatedAt: data?.updated_at || null,
      verificationAvailable: data?.verification_available !== false,
      sendAvailable: data?.send_available !== false,
      warning: data?.warning || '',
    };
  },

  async sendVerificationEmail(accessToken) {
    const data = await postEmailVerification('send', accessToken);
    return {
      email: data?.email || '',
      emailVerified: Boolean(data?.email_verified),
      requestedAt: data?.requested_at || null,
    };
  },
};
