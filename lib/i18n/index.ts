/**
 * i18next singleton — initialised once on the client side.
 *
 * Supported languages: en (default), es, fr.
 * Domain-specific terms (AOI, Carbon Potential, Reversal Risk, Credit Class,
 * Biochar, Prescribed Grazing, etc.) are kept in English in all locales.
 *
 * Import this file wherever you need access to the raw i18next instance
 * (e.g. to call i18n.changeLanguage). Components should use the
 * `useTranslation` hook from react-i18next directly.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

if (!i18n.isInitialized) {
  // Restore persisted language preference, defaulting to 'en'
  const savedLang =
  typeof window !== 'undefined' ? localStorage.getItem('regen-lang') || 'en' : 'en';

const supportedLangs = ['en', 'es', 'fr'];
const lng = supportedLangs.includes(savedLang) ? savedLang : 'en';

  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
    },
    lng,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    initImmediate: false, // synchronous init — no flash
  });
}

export default i18n;
