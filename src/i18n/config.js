import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const FALLBACK_LANGUAGE = 'en';
const SUPPORTED_LANGUAGES = ['en', 'nl', 'fr', 'de', 'pt'];
const translationLoaders = {
  en: () => import('./locales/en/translation.json'),
  nl: () => import('./locales/nl/translation.json'),
  fr: () => import('./locales/fr/translation.json'),
  de: () => import('./locales/de/translation.json'),
  pt: () => import('./locales/pt/translation.json'),
};

const normalizeLanguage = (language) => {
  const code = String(language || '')
    .trim()
    .toLowerCase()
    .split('-')[0];
  return SUPPORTED_LANGUAGES.includes(code) ? code : FALLBACK_LANGUAGE;
};

const detectInitialLanguage = () => {
  if (typeof window === 'undefined') return FALLBACK_LANGUAGE;

  const storedLanguageValue = window.localStorage?.getItem('i18nextLng');
  if (storedLanguageValue) {
    return normalizeLanguage(storedLanguageValue);
  }

  const browserLanguages = Array.isArray(window.navigator?.languages)
    ? window.navigator.languages
    : [window.navigator?.language];
  const browserLanguage = browserLanguages
    .map(normalizeLanguage)
    .find((language) => language !== FALLBACK_LANGUAGE);

  return browserLanguage || FALLBACK_LANGUAGE;
};

const loadedLanguages = new Set();
const loadingLanguages = new Map();

const loadTranslationResource = async (language) => {
  const lng = normalizeLanguage(language);
  if (!loadingLanguages.has(lng)) {
    loadingLanguages.set(
      lng,
      translationLoaders[lng]().then((mod) => mod.default || mod).finally(() => {
        loadingLanguages.delete(lng);
      })
    );
  }

  return loadingLanguages.get(lng);
};

export const loadLanguage = async (language) => {
  const lng = normalizeLanguage(language);
  if (loadedLanguages.has(lng) || (i18n.isInitialized && i18n.hasResourceBundle(lng, 'translation'))) {
    loadedLanguages.add(lng);
    return lng;
  }

  const resource = await loadTranslationResource(lng);
  if (i18n.isInitialized) {
    i18n.addResourceBundle(lng, 'translation', resource, true, true);
  }
  loadedLanguages.add(lng);
  return lng;
};

const loadFallbackLanguageWhenIdle = () => {
  if (loadedLanguages.has(FALLBACK_LANGUAGE)) return;
  const loadFallback = () => {
    loadLanguage(FALLBACK_LANGUAGE).catch(() => {});
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(loadFallback, { timeout: 4000 });
    return;
  }

  setTimeout(loadFallback, 1000);
};

const initializeI18n = async () => {
  const initialLanguage = detectInitialLanguage();
  const initialTranslation = await loadTranslationResource(initialLanguage);
  loadedLanguages.add(initialLanguage);

  await i18n?.use(LanguageDetector)?.use(initReactI18next)?.init({
    resources: {
      [initialLanguage]: { translation: initialTranslation },
    },
    fallbackLng: FALLBACK_LANGUAGE,
    lng: initialLanguage,
    supportedLngs: SUPPORTED_LANGUAGES,
    partialBundledLanguages: true,
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

  const originalChangeLanguage = i18n.changeLanguage.bind(i18n);
  i18n.changeLanguage = async (language, callback) => {
    const lng = normalizeLanguage(language);
    await loadLanguage(lng);
    return originalChangeLanguage(lng, callback);
  };

  loadFallbackLanguageWhenIdle();
};

export const i18nReady = initializeI18n();

export default i18n;
