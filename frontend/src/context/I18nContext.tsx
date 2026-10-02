import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import esTranslations from '../locales/es.json';
import enTranslations from '../locales/en.json';

type Locale = 'es' | 'en';

interface I18nContextType {
  locale: Locale;
  setLocale: (lang: Locale) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const translations: Record<Locale, Record<string, any>> = {
  es: esTranslations,
  en: enTranslations,
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('ferre_language');
    return (saved === 'en' || saved === 'es') ? saved : 'es';
  });

  useEffect(() => {
    localStorage.setItem('ferre_language', locale);
  }, [locale]);

  const setLocale = (lang: Locale) => {
    setLocaleState(lang);
  };

  const t = useCallback((path: string, values?: Record<string, string | number>): string => {
    const keys = path.split('.');
    let current: any = translations[locale] || translations.es;

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return path;
      }
    }

    return typeof current === 'string'
      ? current.replace(/\{(\w+)\}/g, (match, key) => values?.[key] !== undefined ? String(values[key]) : match)
      : path;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
