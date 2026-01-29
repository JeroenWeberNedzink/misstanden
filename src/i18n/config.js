import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import translationEN from './locales/en/translation.json';
import translationNL from './locales/nl/translation.json';
import translationFR from './locales/fr/translation.json';
import translationDE from './locales/de/translation.json';

const resources = {
  en: { translation: translationEN },
  nl: { translation: translationNL },
  fr: { translation: translationFR },
  de: { translation: translationDE },
};

i18n?.use(LanguageDetector)?.use(initReactI18next)?.init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'nl', 'fr', 'de'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;