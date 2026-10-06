import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { Rubro, type TenantInfo } from '../types';
import { Button } from '../components/Button';
import { RUBROS_CONFIG } from '../config/rubros';
import { Palette, Building2, Check, RefreshCw, Store, Layout, Type, Eye, Languages, Coins, Receipt } from 'lucide-react';

const PRESET_COLORS = [
  { name: 'Naranja Óxido (FerreSystem)', hex: '#EA580C' },
  { name: 'Rojo Industrial Ferretero', hex: '#DC2626' },
  { name: 'Azul Acero Profesional', hex: '#0284C7' },
  { name: 'Amarillo Seguridad CAT', hex: '#D97706' },
  { name: 'Verde Taller / Ferretería', hex: '#16A34A' },
  { name: 'Gris Grafito Minimalista', hex: '#4B5563' },
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
  const [monedaSimbolo, setMonedaSimbolo] = useState(tenant.moneda?.simbolo || 'L.');
  const [monedaCodigo, setMonedaCodigo] = useState(tenant.moneda?.codigo || 'HNL');
  const [impuestoNombre, setImpuestoNombre] = useState(tenant.impuesto?.nombre || 'ISV');
  const [impuestoTasa, setImpuestoTasa] = useState(tenant.impuesto?.tasa?.toString() || '15');

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
      setMonedaSimbolo(tenant.moneda?.simbolo || 'L.');
      setMonedaCodigo(tenant.moneda?.codigo || 'HNL');
      setImpuestoNombre(tenant.impuesto?.nombre || 'ISV');
      setImpuestoTasa(tenant.impuesto?.tasa?.toString() || '15');
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
    setMonedaSimbolo('L.');
    setMonedaCodigo('HNL');
    setImpuestoNombre('ISV');
    setImpuestoTasa('15');

  };

  return (
    <div style={styles.container}>
      <TopBar title="CONFIGURACIÓN Y MARCA" subtitle="Datos del negocio y apariencia" />

      <main style={styles.content}>
        <p>{t('settings.scope')}</p>
        {saveError && <p role="alert">{saveError}</p>}

        {guardadoExitoso && (
          <div role="status" style={styles.successBanner}>
            <Check size={20} strokeWidth={2.6} color="#15803D" />
            <span style={{ fontWeight: 700 }}>
              ¡Configuración de marca y fiscal guardadas correctamente para "{nombre}"!
            </span>
          </div>
        )}

        <form className="tenant-settings-grid" onSubmit={handleGuardar} onChange={() => { dirty.current = true; }} onClick={event => { if ((event.target as HTMLElement).closest('button[type="button"]')) dirty.current = true; }} aria-busy={saving} style={styles.grid}>
          {/* Columna Izquierda: Identidad y Datos del Negocio */}
          <div className="industrial-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <Building2 size={20} strokeWidth={2.4} color="var(--color-primary)" />
              <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>DATOS COMERCIALES Y LOCALE</h2>
            </div>

            {/* Selector de Idioma (I18n ES / EN) */}
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Languages size={14} color="var(--color-primary)" />
                <span>IDIOMA DEL SISTEMA / SYSTEM LANGUAGE</span>
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
              <label className="form-label">NOMBRE COMERCIAL (APARECE EN SIDEBAR Y FACTURAS)</label>
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
              <label className="form-label">URL LOGO PERSONALIZADO (IMAGEN CORPORATIVA)</label>
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
                <span>RUBRO / GIRO COMERCIAL (MOTOR MULTI-RUBRO)</span>
              </label>
              <select
                id="business-sector" aria-label={t('settings.sector')} value={rubro}
                onChange={(e) => setRubro(e.target.value as Rubro)}
                className="form-select"
                style={{ fontWeight: 700 }}
              >
                {Object.keys(Rubro).map((rKey) => {
                  const cfg = RUBROS_CONFIG[rKey as Rubro];
                  return (
                    <option key={rKey} value={rKey}>
                      {rKey} — {cfg?.nombreCatalogo || rKey}
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
            <h3>{t('settings.currency_tax')}</h3><p>{t('settings.fiscal_help')}</p>
            <label htmlFor="currency-code" className="form-label">{t('settings.currency_code')}</label>
            <input id="currency-code" className="form-input" required pattern="[A-Z]{3}" maxLength={3} value={monedaCodigo} onChange={event => setMonedaCodigo(event.target.value.toUpperCase())} />
            {/* Configuración de Moneda e Impuesto */}
            <div className="settings-fiscal-row" style={{ display: 'flex', gap: '12px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Coins size={14} color="var(--color-primary)" />
                  <span>SÍMBOLO MONEDA</span>
                </label>
                <input
                  type="text"
                  required
                  id="currency-symbol" aria-label={t('settings.symbol')} value={monedaSimbolo}
                  onChange={(e) => setMonedaSimbolo(e.target.value)}
                  className="form-input"
                  style={{ fontWeight: 800 }}
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Receipt size={14} color="var(--color-primary)" />
                  <span>IMPUESTO (%)</span>
                </label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    type="text"
                    required
                    id="tax-name" aria-label={t('settings.tax_name')} value={impuestoNombre}
                    onChange={(e) => setImpuestoNombre(e.target.value)}
                    className="form-input"
                    style={{ width: '70px', fontWeight: 800 }}
                  />
                  <input
                    type="number"
                    required
                    id="tax-rate" aria-label={t('settings.tax_rate')} min="0" max="100" step="0.01" value={impuestoTasa}
                    onChange={(e) => setImpuestoTasa(e.target.value)}
                    className="form-input"
                    style={{ fontWeight: 800 }}
                  />
                  <span style={{ fontWeight: 800 }}>%</span>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="template-version" className="form-label">Plantilla de diseño</label>
              <select id="template-version" className="form-select" value={templateVersion} onChange={e => setTemplateVersion(e.target.value as 'v1' | 'v2')}>
                <option value="v1">Clásica (V1)</option><option value="v2">Template V2</option>
              </select>
              {templateVersion === 'v2' ? <>
                <label htmlFor="v2-mode" className="form-label">Modo de Template V2</label>
                <select id="v2-mode" className="form-select" value={v2Mode} onChange={e => setV2Mode(e.target.value as NonNullable<TenantInfo['v2Mode']>)}>
                  <option value="light">Claro Corporativo</option><option value="dark">Oscuro Industrial</option><option value="hybrid">Enérgico</option>
                </select>
              </> : <>
                <label htmlFor="classic-style" className="form-label">Variante clásica</label>
                <select id="classic-style" className="form-select" value={estiloUI} onChange={e => setEstiloUI(e.target.value as NonNullable<TenantInfo['estiloUI']>)}>
                  <option value="INDUSTRIAL">Industrial</option><option value="MINIMALISTA">Minimalista</option><option value="MODERNO">Moderno</option>
                </select>
              </>}
              <small>Conserva tu logo, color y tipografías. La apariencia se guarda para toda la empresa al aplicar los cambios.</small>
            </div>
            {/* Selector de Estilo de Interfaz y Modo de Navegación */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layout size={14} color="var(--color-primary)" />
                <span>MODO DE NAVEGACIÓN Y ESTRUCTURA DE PÁGINA</span>
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
                  <div style={{ fontWeight: 900, fontSize: '11px' }}>MENÚ LATERAL (SIDEBAR)</div>
                  <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>Panel vertical a la izquierda</div>
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
                  <div style={{ fontWeight: 900, fontSize: '11px' }}>MENÚ SUPERIOR (TOPNAV)</div>
                  <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>Navegación horizontal completa</div>
                </button>
              </div>
            </div>

            <details><summary>{t('settings.typography')}</summary>
            {/* Tipografía de Títulos y Cuerpo */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Type size={14} color="var(--color-primary)" />
                  <span>FUENTE TÍTULOS</span>
                </label>
                <select
                  id="heading-font" aria-label={t('settings.heading_font')} value={fuenteTitulos}
                  onChange={(e) => setFuenteTitulos(e.target.value as any)}
                  className="form-select"
                >
                  <option value="Archivo">Archivo (Industrial)</option>
                  <option value="Space Grotesk">Space Grotesk (Tech)</option>
                  <option value="Poppins">Poppins (Clean)</option>
                  <option value="Montserrat">Montserrat (Elegante)</option>
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Type size={14} color="var(--color-primary)" />
                  <span>FUENTE CUERPO</span>
                </label>
                <select
                  id="body-font" aria-label={t('settings.body_font')} value={fuenteCuerpo}
                  onChange={(e) => setFuenteCuerpo(e.target.value as any)}
                  className="form-select"
                >
                  <option value="Inter">Inter (Estándar UI)</option>
                  <option value="IBM Plex Sans">IBM Plex Sans (Técnico)</option>
                  <option value="Nunito Sans">Nunito Sans (Redondeado)</option>
                </select>
              </div>
            </div>
            </details>
          </div>

          {/* Columna Derecha: White-Labeling y Selector de Color Primario & Preview */}
          <div className="industrial-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <Palette size={20} strokeWidth={2.4} color="var(--color-primary)" />
              <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>COLOR DE MARCA & VISTA PREVIA EN VIVO</h2>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '12px' }}>
              Elige el color que identificará tu empresa en la navegación, los botones y los documentos.
            </p>

            {/* Selector de color HEX interactivo */}
            <div style={styles.colorPickerRow}>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={styles.nativeColorInput}
              />
              <div style={{ flex: 1 }}>
                <label className="form-label">CÓDIGO HEXADECIMAL</label>
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
              <label className="form-label">PALETAS INDUSTRIALES VALIDADAS</label>
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
                    <span style={{ fontSize: '11px', fontWeight: 700 }}>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* VISTA PREVIA EN VIVO DEL TEMA Y FUENTES */}
            <div style={{ ...styles.previewBox, marginTop: '20px', border: '2px solid var(--color-sidebar-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px' }}>
                <Eye size={14} color={color} /> VISTA PREVIA EN VIVO ({locale.toUpperCase()})
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
                  {nombre || 'NOMBRE DE TIENDA'}
                </div>
                <div style={{ fontFamily: `"${fuenteCuerpo}", sans-serif`, fontSize: '12px', marginTop: '4px', opacity: 0.85 }}>
                  Moneda: {monedaSimbolo} ({monedaCodigo}) • Impuesto: {impuestoNombre} {impuestoTasa}%
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button type="button" style={{ padding: '6px 12px', backgroundColor: color, color: '#FFFFFF', border: 'none', borderRadius: '4px', fontWeight: 800, fontSize: '11px' }}>
                    BOTÓN ACTIVO
                  </button>
                  <span className="badge badge-success">SISTEMA OK</span>
                </div>
              </div>
            </div>

            <div className="settings-save-actions" style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRestablecerDefault}
              >
                <RefreshCw size={14} /> RESTABLECER
              </button>
              <Button type="submit" disabled={saving} style={{ flex: 1 }}>
                <Check size={16} strokeWidth={2.6} /> APLICAR CAMBIOS
              </Button>
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
