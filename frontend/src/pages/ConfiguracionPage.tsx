import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { Rubro, type TenantInfo } from '../types';
import { Button } from '../components/Button';
import { Palette, Building2, Check, RefreshCw, Store, Layout, Type, Eye, Languages, Coins, Receipt } from 'lucide-react';

const PRESET_COLORS = [
  { name: 'uxAudit.color_0', hex: '#EA580C' },
  { name: 'uxAudit.color_1', hex: '#DC2626' },
  { name: 'uxAudit.color_2', hex: '#0284C7' },
  { name: 'uxAudit.color_3', hex: '#D97706' },
  { name: 'uxAudit.color_4', hex: '#16A34A' },
  { name: 'uxAudit.color_5', hex: '#4B5563' },
];

export const ConfiguracionPage: React.FC = () => {
  const { tenant, updateTenantConfig } = useTenant();
  const { locale, setLocale, t } = useI18n();

  const [templateVersion, setTemplateVersion] = useState<'v1' | 'v2'>(tenant.templateVersion || 'v1');
  const [v2Mode, setV2Mode] = useState<NonNullable<TenantInfo['v2Mode']>>(tenant.v2Mode || 'light');
  const [nombre, setNombre] = useState(tenant.nombreComercial || '');
  const [sucursal, setSucursal] = useState(tenant.sucursal || '');
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl || '');
  const [color, setColor] = useState(tenant.colorPrimario || '#EA580C');
  const [rubro, setRubro] = useState<Rubro>((tenant.rubro || Rubro.FERRETERIA) as Rubro);
  const [estiloUI, setEstiloUI] = useState<'INDUSTRIAL' | 'MINIMALISTA' | 'MODERNO'>(
    (tenant.estiloUI || 'INDUSTRIAL') as any,
  );
  const [modoNavegacion, setModoNavegacion] = useState<'SIDEBAR' | 'TOPNAV'>(
    (tenant.modoNavegacion || 'SIDEBAR') as any,
  );
  const [fuenteTitulos, setFuenteTitulos] = useState<'Archivo' | 'Space Grotesk' | 'Poppins' | 'Montserrat'>(
    (tenant.fuenteTitulos || 'Archivo') as any,
  );
  const [fuenteCuerpo, setFuenteCuerpo] = useState<'Inter' | 'IBM Plex Sans' | 'Nunito Sans'>(
    (tenant.fuenteCuerpo || 'Inter') as any,
  );

  // Moneda e Impuesto
  const monedaSimbolo = 'L.';
  const monedaCodigo = 'HNL';
  const impuestoNombre = 'ISV';
  const impuestoTasa = '15';

  const [direccion, setDireccion] = useState(tenant.direccion || '');
  const [telefono, setTelefono] = useState(tenant.telefono || '');
  const [email, setEmail] = useState(tenant.email || '');
  const dirty = React.useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);

  // Sincronizar estados cuando el tenant del contexto cambie o cargue
  React.useEffect(() => {
    if (tenant && !dirty.current) {
      setTemplateVersion(tenant.templateVersion || 'v1');
      setV2Mode(tenant.v2Mode || 'light');
      setNombre(tenant.nombreComercial || '');
      setSucursal(tenant.sucursal || '');
      setLogoUrl(tenant.logoUrl || '');
      setColor(tenant.colorPrimario || '#EA580C');
      setRubro((tenant.rubro || Rubro.FERRETERIA) as Rubro);
      setEstiloUI((tenant.estiloUI || 'INDUSTRIAL') as any);
      setModoNavegacion((tenant.modoNavegacion || 'SIDEBAR') as any);
      setFuenteTitulos((tenant.fuenteTitulos || 'Archivo') as any);
      setFuenteCuerpo((tenant.fuenteCuerpo || 'Inter') as any);

      setDireccion(tenant.direccion || '');
      setTelefono(tenant.telefono || '');
      setEmail(tenant.email || '');
    }
  }, [tenant]);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();

    const updatedMoneda = { simbolo: monedaSimbolo, codigo: monedaCodigo };
    const updatedImpuesto = { nombre: impuestoNombre, tasa: Number(impuestoTasa) };

    if (saving) return;
    setSaving(true); setSaveError(''); setGuardadoExitoso(false);
    try {
      const { data } = await api.put('/tenant/settings', {
        nombreComercial: nombre,
        direccion,
        telefono,
        email,
        colorPrimario: color,
        logoUrl: logoUrl.trim() || null,
        modoNavegacion,
        configuracion: { rubro, estiloUI, templateVersion, v2Mode, fuenteTitulos, fuenteCuerpo, moneda: updatedMoneda, impuesto: updatedImpuesto },
      });

      dirty.current = false;
      updateTenantConfig({ ...data.configuracion, ...data, sucursal });

      setGuardadoExitoso(true);
      setTimeout(() => setGuardadoExitoso(false), 4000);
    } catch (err: any) {
      console.error('Error al guardar configuración del tenant:', err);
      setSaveError(err.response?.data?.message || (locale === 'es' ? 'No se pudo guardar. Tus cambios siguen en el formulario; vuelve a intentar.' : 'Could not save. Your changes remain in the form; please retry.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRestablecerDefault = () => {
    setColor('#EA580C');
    setEstiloUI('INDUSTRIAL');
    setFuenteTitulos('Archivo');
    setFuenteCuerpo('Inter');

  };

  return (
    <div style={styles.container}>
      <TopBar title={t('uxAudit.settings_and_branding')} subtitle={t('uxAudit.business_details_and_appearance')} />

      <main style={styles.content}>
        <p>{t('settings.scope')}</p>
        {saveError && <p role="alert">{saveError}</p>}

        {guardadoExitoso && (
          <div role="status" style={styles.successBanner}>
            <Check size={20} strokeWidth={2.6} color="#15803D" />
            <span style={{ fontWeight: 700 }}>
              {t('settings.saved', { name: nombre })}
            </span>
          </div>
        )}

        <form className="tenant-settings-grid" onSubmit={handleGuardar} onChange={() => { dirty.current = true; }} onClick={event => { if ((event.target as HTMLElement).closest('button[type="button"]')) dirty.current = true; }} aria-busy={saving} style={styles.grid}>
          {/* Columna Izquierda: Identidad y Datos del Negocio */}
          <div className="industrial-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <Building2 size={20} strokeWidth={2.4} color="var(--color-primary)" />
              <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>{t('uxAudit.business_details_and_language')} </h2>
            </div>

            {/* Selector de Idioma (I18n ES / EN) */}
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Languages size={14} color="var(--color-primary)" />
                <span>{t('uxAudit.system_language')} </span>
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setLocale('es')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontWeight: 800,
                    backgroundColor: locale === 'es' ? 'var(--color-text-main)' : 'var(--color-surface)',
                    color: locale === 'es' ? 'var(--color-bg)' : 'var(--color-text-main)',
                    border: '1.5px solid var(--color-sidebar-bg)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Español (ES)
                </button>
                <button
                  type="button"
                  onClick={() => setLocale('en')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontWeight: 800,
                    backgroundColor: locale === 'en' ? 'var(--color-text-main)' : 'var(--color-surface)',
                    color: locale === 'en' ? 'var(--color-bg)' : 'var(--color-text-main)',
                    border: '1.5px solid var(--color-sidebar-bg)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  English (EN)
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('uxAudit.business_name_shown_in_navigation_and_receipts')} </label>
              <input
                type="text"
                required
                id="business-name" aria-label={t('settings.name')} value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="form-input"
              />
            </div>

            {/* URL del Logo Personalizado de la Empresa */}
            <div className="form-group">
              <label className="form-label">{t('uxAudit.custom_logo_url_company_image')} </label>
              <input
                type="url"
                placeholder="https://ejemplo.com/logo-ferreteria.png"
                id="business-logo" aria-label={t('settings.logo')} value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="form-input"
              />
            </div>

            {/* Selector de Rubro Comercial */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Store size={14} color="var(--color-primary)" />
                <span>{t('uxAudit.business_sector')} </span>
              </label>
              <select
                id="business-sector" aria-label={t('settings.sector')} value={rubro}
                onChange={(e) => setRubro(e.target.value as Rubro)}
                className="form-select"
                style={{ fontWeight: 700 }}
              >
                {Object.keys(Rubro).map((rKey) => {
                  return (
                    <option key={rKey} value={rKey}>
                      {t('sectors.' + rKey)}
                    </option>
                  );
                })}
              </select>
            </div>

            <details><summary>{t('settings.contact')}</summary>
              <label className="form-label" htmlFor="company-address">{t('settings.address')}</label><input id="company-address" className="form-input" value={direccion} onChange={event => setDireccion(event.target.value)} />
              <label className="form-label" htmlFor="company-phone">{t('settings.phone')}</label><input id="company-phone" type="tel" className="form-input" value={telefono} onChange={event => setTelefono(event.target.value)} />
              <label className="form-label" htmlFor="company-email">{t('settings.email')}</label><input id="company-email" type="email" className="form-input" value={email} onChange={event => setEmail(event.target.value)} />
            </details>
            <h3>{t('settings.currency_tax')}</h3><p id="fiscal-limit">{t('settings.fiscal_help')}</p>
            <label htmlFor="currency-code" className="form-label">{t('settings.currency_code')}</label>
            <input id="currency-code" className="form-input" required pattern="[A-Z]{3}" maxLength={3} value={monedaCodigo} readOnly aria-describedby="fiscal-limit" />
            {/* Configuración de Moneda e Impuesto */}
            <div className="settings-fiscal-row" style={{ display: 'flex', gap: '12px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Coins size={14} color="var(--color-primary)" />
                  <span>{t('uxAudit.currency_symbol')} </span>
                </label>
                <input
                  type="text"
                  required
                  id="currency-symbol" aria-label={t('settings.symbol')} value={monedaSimbolo}
                  readOnly aria-describedby="fiscal-limit"
                  className="form-input"
                  style={{ fontWeight: 800 }}
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Receipt size={14} color="var(--color-primary)" />
                  <span>{t('uxAudit.tax_percent')} </span>
                </label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    type="text"
                    required
                    id="tax-name" aria-label={t('settings.tax_name')} value={impuestoNombre}
                    readOnly aria-describedby="fiscal-limit"
                    className="form-input"
                    style={{ width: '70px', fontWeight: 800 }}
                  />
                  <input
                    type="number"
                    required
                    id="tax-rate" aria-label={t('settings.tax_rate')} min="0" max="100" step="0.01" value={impuestoTasa}
                    readOnly aria-describedby="fiscal-limit"
                    className="form-input"
                    style={{ fontWeight: 800 }}
                  />
                  <span style={{ fontWeight: 800 }}>%</span>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="template-version" className="form-label">{t('uxAudit.design_template')} </label>
              <select id="template-version" className="form-select" value={templateVersion} onChange={e => setTemplateVersion(e.target.value as 'v1' | 'v2')}>
                <option value="v1">{t('uxAudit.classic_v1')} </option><option value="v2">Template V2</option>
              </select>
              {templateVersion === 'v2' ? <>
                <label htmlFor="v2-mode" className="form-label">{t('uxAudit.template_v2_mode')} </label>
                <select id="v2-mode" className="form-select" value={v2Mode} onChange={e => setV2Mode(e.target.value as NonNullable<TenantInfo['v2Mode']>)}>
                  <option value="light">{t('uxAudit.corporate_light')} </option><option value="dark">{t('uxAudit.industrial_dark')} </option><option value="hybrid">{t('uxAudit.energetic')} </option>
                </select>
              </> : <>
                <label htmlFor="classic-style" className="form-label">{t('uxAudit.classic_variant')} </label>
                <select id="classic-style" className="form-select" value={estiloUI} onChange={e => setEstiloUI(e.target.value as NonNullable<TenantInfo['estiloUI']>)}>
                  <option value="INDUSTRIAL">Industrial</option><option value="MINIMALISTA">{t('uxAudit.minimalist')} </option><option value="MODERNO">{t('uxAudit.modern')} </option>
                </select>
              </>}
              <small>{t('uxAudit.keeps_your_logo_color_and_fonts_appearance_is_saved_for_the_whole_company_when_you_apply_changes')} </small>
            </div>
            {/* Selector de Estilo de Interfaz y Modo de Navegación */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layout size={14} color="var(--color-primary)" />
                <span>{t('uxAudit.navigation_mode_and_page_structure')} </span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  aria-pressed={modoNavegacion === 'SIDEBAR'} onClick={() => setModoNavegacion('SIDEBAR')}
                  style={{
                    padding: '10px',
                    backgroundColor: modoNavegacion === 'SIDEBAR' ? 'var(--color-text-main)' : 'var(--color-surface)',
                    color: modoNavegacion === 'SIDEBAR' ? 'var(--color-bg)' : 'var(--color-text-main)',
                    border: modoNavegacion === 'SIDEBAR' ? '2px solid var(--color-primary)' : '1.5px solid var(--color-sidebar-text)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: '11px' }}>{t('uxAudit.side_menu_sidebar')} </div>
                  <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>{t('uxAudit.vertical_panel_on_the_left')} </div>
                </button>

                <button
                  type="button"
                  aria-pressed={modoNavegacion === 'TOPNAV'} onClick={() => setModoNavegacion('TOPNAV')}
                  style={{
                    padding: '10px',
                    backgroundColor: modoNavegacion === 'TOPNAV' ? 'var(--color-text-main)' : 'var(--color-surface)',
                    color: modoNavegacion === 'TOPNAV' ? 'var(--color-bg)' : 'var(--color-text-main)',
                    border: modoNavegacion === 'TOPNAV' ? '2px solid var(--color-primary)' : '1.5px solid var(--color-sidebar-text)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: '11px' }}>{t('uxAudit.top_menu_topnav')} </div>
                  <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>{t('uxAudit.full_horizontal_navigation')} </div>
                </button>
              </div>
            </div>

            <details><summary>{t('settings.typography')}</summary>
            {/* Tipografía de Títulos y Cuerpo */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Type size={14} color="var(--color-primary)" />
                  <span>{t('uxAudit.heading_font')} </span>
                </label>
                <select
                  id="heading-font" aria-label={t('settings.heading_font')} value={fuenteTitulos}
                  onChange={(e) => setFuenteTitulos(e.target.value as any)}
                  className="form-select"
                >
                  <option value="Archivo">Archivo (Industrial)</option>
                  <option value="Space Grotesk">Space Grotesk (Tech)</option>
                  <option value="Poppins">Poppins (Clean)</option>
                  <option value="Montserrat">{t('uxAudit.montserrat_elegant')} </option>
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Type size={14} color="var(--color-primary)" />
                  <span>{t('uxAudit.body_font')} </span>
                </label>
                <select
                  id="body-font" aria-label={t('settings.body_font')} value={fuenteCuerpo}
                  onChange={(e) => setFuenteCuerpo(e.target.value as any)}
                  className="form-select"
                >
                  <option value="Inter">{t('uxAudit.inter_standard_ui')} </option>
                  <option value="IBM Plex Sans">{t('uxAudit.ibm_plex_sans_technical')} </option>
                  <option value="Nunito Sans">{t('uxAudit.nunito_sans_rounded')} </option>
                </select>
              </div>
            </div>
            </details>
          </div>

          {/* Columna Derecha: White-Labeling y Selector de Color Primario & Preview */}
          <div className="industrial-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <Palette size={20} strokeWidth={2.4} color="var(--color-primary)" />
              <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>{t('uxAudit.brand_color_live_preview')} </h2>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '12px' }}>{t('uxAudit.choose_the_color_used_for_your_company_in_navigation_buttons_and_documents')} </p>

            {/* Selector de color HEX interactivo */}
            <div style={styles.colorPickerRow}>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={styles.nativeColorInput}
              />
              <div style={{ flex: 1 }}>
                <label className="form-label">{t('uxAudit.hex_code')} </label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="form-input"
                  style={{ fontFamily: 'monospace', fontWeight: 700 }}
                />
              </div>
            </div>

            {/* Paletas recomendadas */}
            <div style={{ marginTop: '16px' }}>
              <label className="form-label">{t('uxAudit.industrial_color_palettes')} </label>
              <div style={styles.presetsGrid}>
                {PRESET_COLORS.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => setColor(p.hex)}
                    style={{
                      ...styles.presetBtn,
                      borderColor: color.toUpperCase() === p.hex.toUpperCase() ? 'var(--color-sidebar-bg)' : 'var(--color-sidebar-text)',
                      borderWidth: color.toUpperCase() === p.hex.toUpperCase() ? '2.5px' : '1.5px',
                    }}
                  >
                    <span style={{ ...styles.colorCircle, backgroundColor: p.hex }} />
                    <span style={{ fontSize: '11px', fontWeight: 700 }}>{t(p.name)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* VISTA PREVIA EN VIVO DEL TEMA Y FUENTES */}
            <div style={{ ...styles.previewBox, marginTop: '20px', border: '2px solid var(--color-sidebar-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px' }}>
                <Eye size={14} color={color} />{t('uxAudit.live_preview')} {locale.toUpperCase()})
              </div>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: estiloUI === 'MINIMALISTA' ? 'var(--color-surface-hover)' : estiloUI === 'MODERNO' ? color : '#1C1917',
                  color: estiloUI === 'MINIMALISTA' ? 'var(--color-text-main)' : '#FFFFFF',
                  borderRadius: estiloUI === 'MODERNO' ? '12px' : estiloUI === 'MINIMALISTA' ? '10px' : '2px',
                  border: '1px solid #44403C',
                }}
              >
                <div style={{ fontFamily: `"${fuenteTitulos}", sans-serif`, fontWeight: 800, fontSize: '15px' }}>
                  {nombre || t('settings.name')}
                </div>
                <div style={{ fontFamily: `"${fuenteCuerpo}", sans-serif`, fontSize: '12px', marginTop: '4px', opacity: 0.85 }}>{t('uxAudit.currency')} {monedaSimbolo} ({monedaCodigo}{t('uxAudit.tax')} {impuestoNombre} {impuestoTasa}%
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button type="button" style={{ padding: '6px 12px', backgroundColor: color, color: '#FFFFFF', border: 'none', borderRadius: '4px', fontWeight: 800, fontSize: '11px' }}>{t('uxAudit.active_button')} </button>
                  <span className="badge badge-success">{t('uxAudit.system_ok')} </span>
                </div>
              </div>
            </div>

            <div className="settings-save-actions" style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRestablecerDefault}
              >
                <RefreshCw size={14} />{t('uxAudit.reset')} </button>
              <Button type="submit" disabled={saving} style={{ flex: 1 }}>
                <Check size={16} strokeWidth={2.6} />{t('uxAudit.apply_changes')} </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: '100vh',
    backgroundColor: 'var(--color-bg)',
  },
  content: {
    padding: '24px 32px 48px',
    maxWidth: '1400px',
    width: '100%',
  },
  successBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 18px',
    backgroundColor: '#DCFCE7',
    border: '2px solid #15803D',
    borderRadius: 'var(--radius-xs)',
    marginBottom: '20px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
    gap: '24px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    paddingBottom: '12px',
    borderBottom: '2px solid var(--color-border)',
  },
  colorPickerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    marginTop: '14px',
  },
  nativeColorInput: {
    width: '48px',
    height: '48px',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
    padding: 0,
    backgroundColor: 'transparent',
  },
  presetsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginTop: '8px',
  },
  presetBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    backgroundColor: '#FFFFFF',
    borderStyle: 'solid',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  colorCircle: {
    width: '16px',
    height: '16px',
    borderRadius: '2px',
    border: '1px solid var(--color-sidebar-bg)',
    flexShrink: 0,
  },
  previewBox: {
    backgroundColor: 'var(--color-bg)',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '14px',
  },
};
