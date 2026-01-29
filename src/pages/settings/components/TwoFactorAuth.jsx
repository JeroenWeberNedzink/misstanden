import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import * as mfaService from '../../../services/mfaService';

export default function TwoFactorAuth() {
  const { t } = useTranslation();
  const { user, getAccessTokenSilently } = useAuth0();

  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  useEffect(() => {
    checkMFAStatus();
  }, []);

  const checkMFAStatus = async () => {
    try {
      setIsLoading(true);
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: `https://${import.meta.env.VITE_AUTH0_DOMAIN}/mfa/`,
          scope: 'read:authenticators',
        },
      });
      const status = await mfaService.checkMFAStatus(token);
      setIs2FAEnabled(status);
    } catch (err) {
      console.error('Error checking MFA status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const startSetup = async () => {
    try {
      setIsLoading(true);
      setError('');
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: `https://${import.meta.env.VITE_AUTH0_DOMAIN}/mfa/`,
          scope: 'enroll',
        },
      });
      const data = await mfaService.startMFAEnrollment(token);
      setQrCodeUrl(data.qrCodeUrl);
      setSecret(data.secret);
      setIsSetupMode(true);
    } catch (err) {
      console.error('Error starting 2FA setup:', err);
      setError(err.message || t('settings.twoFactor.errorEnabling'));
    } finally {
      setIsLoading(false);
    }
  };

  const verifyAndEnable = async () => {
    try {
      setIsLoading(true);
      setError('');
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: `https://${import.meta.env.VITE_AUTH0_DOMAIN}/mfa/`,
          scope: 'enroll',
        },
      });
      const success = await mfaService.verifyMFAEnrollment(verificationCode, token);

      if (success) {
        const codes = mfaService.generateBackupCodes();
        setBackupCodes(codes);
        setShowBackupCodes(true);
        setIs2FAEnabled(true);
        setIsSetupMode(false);
        setVerificationCode('');
      } else {
        setError(t('settings.twoFactor.invalidCode'));
      }
    } catch (err) {
      console.error('Error verifying 2FA code:', err);
      setError(t('settings.twoFactor.errorEnabling'));
    } finally {
      setIsLoading(false);
    }
  };

  const disable2FA = async () => {
    if (!window.confirm(t('settings.twoFactor.confirmDisable'))) {
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: `https://${import.meta.env.VITE_AUTH0_DOMAIN}/mfa/`,
          scope: 'remove:authenticators',
        },
      });
      const success = await mfaService.deleteAllMFAAuthenticators(token);

      if (success) {
        setIs2FAEnabled(false);
        setShowBackupCodes(false);
        setBackupCodes([]);
      }
    } catch (err) {
      console.error('Error disabling 2FA:', err);
      setError(t('settings.twoFactor.errorDisabling'));
    } finally {
      setIsLoading(false);
    }
  };

  const downloadBackupCodes = () => {
    mfaService.downloadBackupCodes(backupCodes);
  };

  const copyBackupCodes = async () => {
    const success = await mfaService.copyBackupCodesToClipboard(backupCodes);
    if (success) {
      alert(t('settings.twoFactor.codesCopied'));
    }
  };

  if (isLoading && !isSetupMode) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Icon name="Loader" size={16} className="animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon name="Shield" size={24} className="text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">{t('settings.twoFactor.title')}</h2>
                <p className="text-sm text-muted-foreground">{t('settings.twoFactor.subtitle')}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('settings.twoFactor.status')}:</span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              is2FAEnabled
                ? 'bg-success/10 text-success border border-success/20'
                : 'bg-muted text-muted-foreground border border-border'
            }`}>
              {is2FAEnabled ? t('settings.twoFactor.enabled') : t('settings.twoFactor.disabled')}
            </span>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-3">
            <Icon name="AlertCircle" size={18} />
            <div className="flex-1 text-sm">{error}</div>
            <Button variant="ghost" size="sm" iconName="X" onClick={() => setError('')} />
          </div>
        )}

        {!is2FAEnabled && !isSetupMode && (
          <div className="mt-6">
            <Button
              variant="primary"
              iconName="Shield"
              iconPosition="left"
              onClick={startSetup}
              disabled={isLoading}
            >
              {t('settings.twoFactor.enableButton')}
            </Button>
          </div>
        )}

        {is2FAEnabled && !showBackupCodes && (
          <div className="mt-6 flex gap-3">
            <Button
              variant="outline"
              iconName="ShieldOff"
              iconPosition="left"
              onClick={disable2FA}
              disabled={isLoading}
            >
              {t('settings.twoFactor.disableButton')}
            </Button>
            <Button
              variant="outline"
              iconName="RefreshCw"
              iconPosition="left"
              onClick={() => {
                const codes = mfaService.generateBackupCodes();
                setBackupCodes(codes);
                setShowBackupCodes(true);
              }}
            >
              {t('settings.twoFactor.regenerateCodes')}
            </Button>
          </div>
        )}
      </div>

      {/* Setup Mode */}
      {isSetupMode && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">{t('settings.twoFactor.setup')}</h3>
            <p className="text-sm text-muted-foreground">{t('settings.twoFactor.setupInstructions')}</p>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-muted/20 border border-border">
            {qrCodeUrl && (
              <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64 rounded-lg" />
            )}

            <div className="text-center">
              <div className="text-xs font-semibold text-foreground mb-1">{t('settings.twoFactor.accountKey')}</div>
              <div className="text-xs text-muted-foreground mb-2">{t('settings.twoFactor.accountKeyDescription')}</div>
              <code className="px-3 py-2 rounded-lg bg-background border border-border text-xs font-mono">
                {secret}
              </code>
            </div>

            <div className="text-xs text-muted-foreground text-center max-w-md">
              {t('settings.twoFactor.appRecommendations')}
            </div>
          </div>

          {/* Verification */}
          <div className="space-y-4">
            <Input
              label={t('settings.twoFactor.enterCode')}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              maxLength={6}
            />

            <div className="flex gap-3">
              <Button
                variant="primary"
                iconName="Check"
                iconPosition="left"
                onClick={verifyAndEnable}
                disabled={isLoading || verificationCode.length !== 6}
              >
                {isLoading ? t('settings.twoFactor.verifying') : t('settings.twoFactor.verifyCode')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsSetupMode(false);
                  setQrCodeUrl('');
                  setSecret('');
                  setVerificationCode('');
                }}
                disabled={isLoading}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Codes */}
      {showBackupCodes && backupCodes.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-6">
          <div className="flex items-start gap-3 mb-4">
            <Icon name="Key" size={20} className="text-warning mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground mb-1">{t('settings.twoFactor.backupCodes')}</h3>
              <p className="text-sm text-muted-foreground">{t('settings.twoFactor.backupCodesDescription')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            {backupCodes.map((code, index) => (
              <div
                key={index}
                className="px-4 py-2 rounded-lg bg-background border border-border text-sm font-mono text-center"
              >
                {code}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              iconName="Download"
              iconPosition="left"
              onClick={downloadBackupCodes}
            >
              {t('settings.twoFactor.downloadCodes')}
            </Button>
            <Button
              variant="outline"
              iconName="Copy"
              iconPosition="left"
              onClick={copyBackupCodes}
            >
              {t('settings.twoFactor.copyCodes')}
            </Button>
            <Button
              variant="ghost"
              iconName="X"
              onClick={() => setShowBackupCodes(false)}
            >
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
