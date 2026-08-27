import React from 'react';
import { useTranslation } from 'react-i18next';
import Input from '../../../components/ui/Input';
import Icon from '../../../components/AppIcon';
import AnonymousReportingNotice from './AnonymousReportingNotice';

const ReporterContactFields = ({
  name,
  email,
  phone,
  isAnonymous,
  onAnonymousChange,
  emailRequired = true,
  emailError,
  onNameChange,
  onEmailChange,
  onPhoneChange
}) => {
  const { t } = useTranslation();
  const handleAnonymousToggle = (anonymous) => {
    onAnonymousChange?.(anonymous);
    if (anonymous) {
      // Keep email for communication, clear name/phone only
      onNameChange('');
      onPhoneChange('');
    }
  };

  return (
    <div className="space-y-3">
      {/* Anonymous Toggle */}
      <div className="space-y-3">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => handleAnonymousToggle(true)}
            className={`
              flex-1 px-4 py-3 rounded-lg border-2 transition-all duration-200
              flex items-center justify-center gap-2 font-medium
              ${isAnonymous
                ? 'border-primary bg-primary/10 text-primary shadow-md'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50'
              }
            `}
          >
            <Icon
              name="ShieldCheck"
              size={20}
              color={isAnonymous ? 'var(--color-primary)' : 'var(--color-muted-foreground)'}
            />
            {t('reportForm.yesAnonymous')}
          </button>
          <button
            type="button"
            onClick={() => handleAnonymousToggle(false)}
            className={`
              flex-1 px-4 py-3 rounded-lg border-2 transition-all duration-200
              flex items-center justify-center gap-2 font-medium
              ${!isAnonymous
                ? 'border-primary bg-primary/10 text-primary shadow-md'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50'
              }
            `}
          >
            <Icon
              name="User"
              size={20}
              color={!isAnonymous ? 'var(--color-primary)' : 'var(--color-muted-foreground)'}
            />
            {t('reportForm.noProvideContact')}
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 mt-2">
        <Icon name="Info" size={16} color="var(--color-primary)" className="mt-1 flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          {t('reportForm.contactDetailsHelp')}
        </p>
      </div>
      <div className="p-4 rounded-lg bg-muted/50 border border-border">
        <div className="space-y-4">
          <Input
            type="email"
            label={t('reportForm.emailLabel')}
            placeholder={t('reportForm.emailPlaceholder')}
            value={email}
            required={emailRequired}
            error={emailError}
            onChange={(e) => onEmailChange(e?.target?.value)}
          />
          {!isAnonymous && (
            <>
              <Input
                type="text"
                label={t('reportForm.nameLabel')}
                placeholder={t('reportForm.namePlaceholder')}
                value={name}
                onChange={(e) => onNameChange(e?.target?.value)}
              />
              <Input
                type="tel"
                label={t('reportForm.phoneLabel')}
                placeholder={t('reportForm.phonePlaceholder')}
                value={phone}
                onChange={(e) => onPhoneChange(e?.target?.value)}
              />
            </>
          )}
        </div>
      </div>

      {/* Show privacy assurance when anonymous */}
      {isAnonymous && (
        <AnonymousReportingNotice emailRequired={emailRequired} />
      )}
    </div>
  );
};

export default ReporterContactFields;
