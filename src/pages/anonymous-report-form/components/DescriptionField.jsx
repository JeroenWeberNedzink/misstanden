import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const DescriptionField = ({ value, onChange, error, maxLength = 2000 }) => {
  const { t } = useTranslation();
  const remainingChars = maxLength - (value?.length || 0);
  const isNearLimit = remainingChars < 200;
  const isAtLimit = remainingChars === 0;

  return (
    <div className="space-y-1">

      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e?.target?.value)}
          placeholder={t('reportForm.descriptionPlaceholder')}
          maxLength={maxLength}
          required
          className={`w-full min-h-[200px] md:min-h-[240px] lg:min-h-[280px] px-4 py-3 rounded-lg border transition-smooth focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-y ${
            error
              ? 'border-error bg-error/5 text-error' :'border-input bg-background text-foreground hover:border-primary/50'
          }`}
          aria-label={t('reportForm.descriptionLabel')}
        />
        <div className={`flex items-center justify-between mt-2 text-sm ${
          isAtLimit ? 'text-error' : isNearLimit ? 'text-warning' : 'text-muted-foreground'
        }`}>
          <span className="flex items-center gap-1">
            <Icon name={isAtLimit ? 'AlertCircle' : 'Info'} size={14} />
            {error || t('reportForm.descriptionHelp')}
          </span>
          <span className="font-medium">
            {remainingChars} / {maxLength} {t('reportForm.charactersRemaining')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DescriptionField;