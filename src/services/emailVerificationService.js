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
    const externallyVerified = Boolean(data?.externally_verified);
    const emailVerified = Boolean(data?.email_verified) || externallyVerified;
    return {
      email: data?.email || '',
      emailVerified,
      updatedAt: data?.updated_at || null,
      verificationAvailable: data?.verification_available !== false,
      sendAvailable: data?.send_available !== false,
      verificationRequired: data?.verification_required !== false && !emailVerified,
      externallyVerified,
      identityProvider: data?.identity_provider || '',
      identityProviderLabel: data?.identity_provider_label || '',
      warning: data?.warning || '',
    };
  },

  async sendVerificationEmail(accessToken) {
    const data = await postEmailVerification('send', accessToken);
    const externallyVerified = Boolean(data?.externally_verified);
    const emailVerified = Boolean(data?.email_verified) || externallyVerified;
    return {
      email: data?.email || '',
      emailVerified,
      requestedAt: data?.requested_at || null,
      verificationRequired: data?.verification_required !== false && !emailVerified,
      externallyVerified,
      identityProvider: data?.identity_provider || '',
      identityProviderLabel: data?.identity_provider_label || '',
    };
  },
};
