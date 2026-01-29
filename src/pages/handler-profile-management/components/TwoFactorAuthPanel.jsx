import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import * as mfaService from '../../../services/mfaService';

const TwoFactorAuthPanel = () => {
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
      <div className="mb-6 p-6 rounded-lg bg-card border border-border flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Icon name="Loader" size={16} className="animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="mb-6 p-6 rounded-lg bg-card border border-border">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Icon name="Shield" size={20} color="var(--color-primary)" />
        <h2 className="text-xl font-semibold text-foreground">Two-Factor Authentication (2FA)</h2>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Voeg een extra beveiligingslaag toe aan uw account met 2FA.
        </p>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
          is2FAEnabled
            ? 'bg-success/10 text-success border border-success/20'
            : 'bg-muted text-muted-foreground border border-border'
        }`}>
          {is2FAEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-3">
          <Icon name="AlertCircle" size={18} />
          <div className="flex-1 text-sm">{error}</div>
          <button onClick={() => setError('')} className="hover:opacity-70">
            <Icon name="X" size={14} />
          </button>
        </div>
      )}

      {/* Main Content */}
      {!is2FAEnabled && !isSetupMode && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/30 border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-2">Why enable 2FA?</h3>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Bescherm uw account tegen ongeautoriseerde toegang</li>
              <li>• Verplicht een tweede verificatiestap bij inloggen</li>
              <li>• Gebruik een authenticator app zoals Google Authenticator of Authy</li>
            </ul>
          </div>

          <Button
            variant="primary"
            iconName="Shield"
            iconPosition="left"
            onClick={startSetup}
            disabled={isLoading}
          >
            Enable 2FA
          </Button>
        </div>
      )}

      {/* 2FA Enabled State */}
      {is2FAEnabled && !isSetupMode && !showBackupCodes && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-success/5 border border-success/20">
            <div className="flex items-start gap-3">
              <Icon name="CheckCircle" size={18} className="text-success mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">2FA is actief</h3>
                <p className="text-xs text-muted-foreground">
                  Uw account is extra beveiligd met two-factor authentication.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              iconName="RefreshCw"
              iconPosition="left"
              onClick={() => {
                const codes = mfaService.generateBackupCodes();
                setBackupCodes(codes);
                setShowBackupCodes(true);
              }}
              size="sm"
            >
              Regenerate Backup Codes
            </Button>
            <Button
              variant="outline"
              iconName="ShieldOff"
              iconPosition="left"
              onClick={disable2FA}
              disabled={isLoading}
              size="sm"
            >
              Disable 2FA
            </Button>
          </div>
        </div>
      )}

      {/* Setup Mode */}
      {isSetupMode && (
        <div className="space-y-6 mt-6">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Setup Instructions</h3>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Scan the QR code below with your authenticator app</li>
              <li>Enter the 6-digit code from your app to verify</li>
              <li>Save your backup codes in a safe place</li>
            </ol>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center gap-4 p-6 rounded-lg bg-muted/20 border border-border">
            {qrCodeUrl && (
              <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 rounded-lg" />
            )}

            <div className="text-center">
              <div className="text-xs font-semibold text-foreground mb-1">Manual Entry Key</div>
              <div className="text-xs text-muted-foreground mb-2">
                Can't scan? Enter this key manually in your app
              </div>
              <code className="px-3 py-2 rounded-lg bg-background border border-border text-xs font-mono">
                {secret}
              </code>
            </div>
          </div>

          {/* Verification */}
          <div className="space-y-4">
            <Input
              label="Verification Code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              description="Enter the 6-digit code from your authenticator app"
            />

            <div className="flex gap-3">
              <Button
                variant="primary"
                iconName="Check"
                iconPosition="left"
                onClick={verifyAndEnable}
                disabled={isLoading || verificationCode.length !== 6}
              >
                {isLoading ? 'Verifying...' : 'Verify & Enable'}
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
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Codes */}
      {showBackupCodes && backupCodes.length > 0 && (
        <div className="mt-6 p-6 rounded-lg border border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3 mb-4">
            <Icon name="Key" size={20} className="text-warning mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground mb-1">Backup Codes</h3>
              <p className="text-xs text-muted-foreground">
                Save these codes in a safe place. You can use them to access your account if you lose your authenticator.
              </p>
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
              size="sm"
            >
              Download
            </Button>
            <Button
              variant="outline"
              iconName="Copy"
              iconPosition="left"
              onClick={copyBackupCodes}
              size="sm"
            >
              Copy
            </Button>
            <Button
              variant="ghost"
              iconName="X"
              onClick={() => setShowBackupCodes(false)}
              size="sm"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TwoFactorAuthPanel;
