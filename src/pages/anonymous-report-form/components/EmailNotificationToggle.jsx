import React from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '../../../components/ui/Checkbox';
import Icon from '../../../components/AppIcon';

const EmailNotificationToggle = ({
  checked,
  onChange,
  disabled
}) => {
  const { t } = useTranslation();
  const handleChange = (e) => {
    if (!disabled) {
      // Call onChange with an event-like object
      onChange({ target: { checked: e.target.checked } });
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="Mail" size={20} color="var(--color-primary)" />
        <h3 className="text-lg font-semibold text-foreground">{t('reportForm.emailNotifications')}</h3>
      </div>
      <div className="p-4 md:p-5 lg:p-6 rounded-lg bg-card border border-border">
        <Checkbox
          label={t('reportForm.emailNotificationsLabel')}
          description={t('reportForm.emailNotificationsDescription')}
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
        />
        {disabled && (
          <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-warning/10">
            <Icon name="AlertTriangle" size={16} color="var(--color-warning)" className="mt-0.5 flex-shrink-0" />
            <p className="text-xs text-warning">
              {t('reportForm.emailNotificationsWarning')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailNotificationToggle;
