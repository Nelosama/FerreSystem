import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useTenant } from './TenantContext';
import esTranslations from '../locales/es.json';
import { registrarTraductor } from '../utils/alertas';

type Locale = 'es' | 'en';

interface I18nContextType {
  locale: Locale;
  setLocale: (lang: Locale) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

type Diccionario = Record<string, any>;

// El español va en la carga inicial; el inglés (~57 KB) se descarga solo si se elige.
// Mientras llega, los textos se muestran en español, como ya ocurría con claves ausentes.
let ingles: Diccionario | null = null;
const cargarIngles = () => import('../locales/en.json').then((m) => (ingles = m.default as Diccionario));

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { tenant, user } = useTenant();
  const [platformLocale, setPlatformLocale] = useState<Locale>(() => localStorage.getItem('ferre_language') === 'en' ? 'en' : 'es');
  const locale: Locale = user?.rol === 'SUPERADMIN' ? platformLocale : user && tenant.idioma === 'en' ? 'en' : 'es';
  const setLocale = (lang: Locale) => {
    // Preferencia de la plataforma; nunca modifica el idioma de un negocio ni de sus usuarios.
    if (user?.rol !== 'SUPERADMIN' || !['es', 'en'].includes(lang)) return;
    setPlatformLocale(lang); localStorage.setItem('ferre_language', lang);
  };
  const [diccionarioIngles, setDiccionarioIngles] = useState<Diccionario | null>(ingles);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  useEffect(() => {
    if (locale !== 'en' || diccionarioIngles) return;
    let vigente = true;
    cargarIngles().then((d) => { if (vigente) setDiccionarioIngles(d); }).catch(() => undefined);
    return () => { vigente = false; };
  }, [locale, diccionarioIngles]);

  const diccionario: Diccionario = locale === 'en' && diccionarioIngles ? diccionarioIngles : esTranslations;

  const t = useCallback((path: string, values?: Record<string, string | number>): string => {
    const keys = path.split('.');
    let current: any = diccionario;

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
  }, [diccionario]);

  // Las alertas (utils/alertas.ts) no son componentes: reciben el mismo traductor que el resto de la interfaz.
  useEffect(() => { registrarTraductor(t); }, [t]);

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
