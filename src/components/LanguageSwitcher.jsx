import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './AppIcon';

const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation();

  const languages = [
    { code: 'en', name: t('language.en') },
    { code: 'nl', name: t('language.nl') },
    { code: 'fr', name: t('language.fr') },
    { code: 'de', name: t('language.de') },
  ];

  const handleLanguageChange = (e) => {
    const newLang = e?.target?.value;
    i18n?.changeLanguage(newLang);
  };

  return (
    <div className="flex items-center gap-2">
      <Icon name="Globe" size={16} className="text-muted-foreground" />
      <select
        value={i18n?.language}
        onChange={handleLanguageChange}
        className="px-3 py-1.5 border border-border rounded-lg bg-card text-foreground hover:bg-muted transition-smooth focus-ring font-medium cursor-pointer"
        aria-label={t('language.select')}
      >
        {languages?.map((lang) => (
          <option key={lang?.code} value={lang?.code}>
            {lang?.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSwitcher;