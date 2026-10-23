import { NegocioNavigation } from '../components/NegocioNavigation';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '../components/TopBar';
import { LogotipoNegocioEditor } from '../components/LogotipoNegocioEditor';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { Rubro } from '../types';
import { Button } from '../components/Button';
import { errorColorHex } from '../utils/colorHex';
import { AvisoColorMarca } from '../components/AvisoColorMarca';
import { FORMATOS_IMPRESION, type FormatoImpresion } from '../utils/formatoImpresion';
import { Palette, Building2, Check, RefreshCw, Store, Eye, Languages, Coins, Receipt, Users, Layers } from 'lucide-react';

const PRESET_COLORS = [
  { name: 'uxAudit.color_0', hex: '#EA580C' },
  { name: 'uxAudit.color_1', hex: '#DC2626' },
  { name: 'uxAudit.color_2', hex: '#0284C7' },
  { name: 'uxAudit.color_3', hex: '#D97706' },
  { name: 'uxAudit.color_4', hex: '#16A34A' },
  { name: 'uxAudit.color_5', hex: '#4B5563' },
];

/**
 * Configuración del negocio seleccionado. Exclusiva del SUPERADMIN: carga y guarda con /admin/tenants/:id/settings,
 * sin modificar la sesión ni el negocio del propio usuario.
 */
export const ConfiguracionPage: React.FC<{ negocioId: string }> = ({ negocioId }) => {
  const { locale, t } = useI18n();
  const [datos, setDatos] = useState<any>(null);
  const [cargaError, setCargaError] = useState('');
  const negocio: any = datos ?? {};

  const [modoGuia, setModoGuia] = useState(false);
  const [idioma, setIdioma] = useState<'es' | 'en'>('es');
  const [nombre, setNombre] = useState(negocio.nombreComercial || '');
  const [color, setColor] = useState(negocio.colorPrimario || '#EA580C');
  const errorColor = errorColorHex(color);
  const [rubro, setRubro] = useState<Rubro>((negocio.rubro || Rubro.FERRETERIA) as Rubro);
  const [formatoImpresion, setFormatoImpresion] = useState<FormatoImpresion>((negocio.formatoImpresion || 'A4') as FormatoImpresion);

  // Moneda e Impuesto
  const monedaSimbolo = 'L.';
  const monedaCodigo = 'HNL';
  const impuestoNombre = 'ISV';
  const impuestoTasa = '15';

  const [direccion, setDireccion] = useState(negocio.direccion || '');
  const [telefono, setTelefono] = useState(negocio.telefono || '');
  const [email, setEmail] = useState(negocio.email || '');
  const dirty = React.useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);

  // Cargar el negocio seleccionado desde la administración.
  React.useEffect(() => {
    let vivo = true;
    setDatos(null); setCargaError('');
    api.get(`/admin/tenants/${negocioId}/settings`)
      .then(({ data }) => { if (vivo) { dirty.current = false; setDatos(data); } })
      .catch(() => { if (vivo) setCargaError('No se pudo cargar la configuración de este negocio.'); });
    return () => { vivo = false; };
  }, [negocioId]);

  // Sincronizar estados cuando el negocio cargado cambie
  React.useEffect(() => {
    if (negocio && !dirty.current) {
      setModoGuia(negocio.modoGuia === true);
      setIdioma(negocio.idioma === 'en' ? 'en' : 'es');
      setNombre(negocio.nombreComercial || '');
      setColor(negocio.colorPrimario || '#EA580C');
      setRubro((negocio.rubro || Rubro.FERRETERIA) as Rubro);
      setFormatoImpresion((negocio.formatoImpresion || 'A4') as FormatoImpresion);

      setDireccion(negocio.direccion || '');
      setTelefono(negocio.telefono || '');
      setEmail(negocio.email || '');
    }
  }, [datos]);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();

    const updatedMoneda = { simbolo: monedaSimbolo, codigo: monedaCodigo };
    const updatedImpuesto = { nombre: impuestoNombre, tasa: Number(impuestoTasa) };

    if (saving) return;
    if (errorColor) { setSaveError(errorColor); return; }
    setSaving(true); setSaveError(''); setGuardadoExitoso(false);
    try {
      const { data } = await api.put(`/admin/tenants/${negocioId}/settings`, {
        nombreComercial: nombre,
        direccion,
        telefono,
        email,
        colorPrimario: color,
        configuracion: { modoGuia, idioma, rubro, formatoImpresion, moneda: updatedMoneda, impuesto: updatedImpuesto },
      });

      dirty.current = false;
      setDatos(data);

      setGuardadoExitoso(true);
      setTimeout(() => setGuardadoExitoso(false), 4000);
    } catch (err: any) {
      console.error('Error al guardar configuración del negocio:', err);
      setSaveError(err.response?.data?.message || (locale === 'es' ? 'No se pudo guardar. Tus cambios siguen en el formulario; vuelve a intentar.' : 'Could not save. Your changes remain in the form; please retry.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRestablecerDefault = () => {
    setColor('#EA580C');
  };

  if (cargaError) return <div style={styles.container}><TopBar title="Configuración del negocio" subtitle="Super Admin" /><main style={styles.content}><p role="alert">{cargaError}</p><Link to="/admin">Volver al panel global</Link></main></div>;
  if (!datos) return <div style={styles.container}><TopBar title="Configuración del negocio" subtitle="Super Admin" /><main style={styles.content}><p role="status">Cargando configuración…</p></main></div>;

  return (
    <div style={styles.container}>
      <TopBar title={t('uxAudit.settings_and_branding')} subtitle={t('uxAudit.business_details_and_appearance')} />

      <main style={styles.content}>
        <p><Link to="/admin">← Volver al panel global</Link></p>
        <NegocioNavigation negocioId={negocioId} />
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

        <form className="negocio-settings-grid tenant-settings-grid" onSubmit={handleGuardar} onChange={() => { dirty.current = true; }} onClick={event => { if ((event.target as HTMLElement).closest('button[type="button"]')) dirty.current = true; }} aria-busy={saving} style={styles.grid}>
<label style={{ display: 'block', margin: '16px 0' }}>{t('guide.setting')} <select className="form-input" value={String(modoGuia)} onChange={e => { dirty.current = true; setModoGuia(e.target.value === 'true'); }}><option value="false">{t('guide.disabled')}</option><option value="true">{t('guide.enabled')}</option></select></label>
          <section className="industrial-card settings-section" style={styles.card} aria-labelledby="settings-section-business">
            <div style={styles.cardHeader}>
              <Building2 size={20} strokeWidth={2.4} color="var(--color-primary-text)" />
              <h2 id="settings-section-business" style={{ fontSize: '15px' }}>1. {t('settings.sections.business')}</h2>
            </div>
            <p className="settings-section-help">{t('settings.sections.business_help')}</p>
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

            {/* Selector de Rubro Comercial */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Store size={14} color="var(--color-primary-text)" />
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
            {/* Selector de Idioma (I18n ES / EN) */}
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Languages size={14} color="var(--color-primary-text)" />
                <span>{t('uxAudit.system_language')} </span>
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIdioma('es')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontWeight: 800,
                    backgroundColor: idioma === 'es' ? 'var(--color-text-main)' : 'var(--color-surface)',
                    color: idioma === 'es' ? 'var(--color-bg)' : 'var(--color-text-main)',
                    border: '1.5px solid var(--color-text-main)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Español (ES)
                </button>
                <button
                  type="button"
                  onClick={() => setIdioma('en')}
                  style={{
                    flex: 1,
                    padding: '8px',
                    fontWeight: 800,
                    backgroundColor: idioma === 'en' ? 'var(--color-text-main)' : 'var(--color-surface)',
                    color: idioma === 'en' ? 'var(--color-bg)' : 'var(--color-text-main)',
                    border: '1.5px solid var(--color-text-main)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  English (EN)
                </button>
              </div>
            </div>

            <LogotipoNegocioEditor
              nivelTitulo="h3"
              negocioId={negocioId}
              nombreNegocio={nombre || negocio.nombreComercial || 'el negocio'}
              logotipo={negocio.logotipo ?? null}
              onCambio={logotipo => setDatos((actual: any) => ({ ...actual, logotipo }))}
            />
            <h3 style={{ fontSize: '14px', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}><Palette size={16} color="var(--color-primary-text)" />{t('uxAudit.brand_color_live_preview')}</h3>
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
                  aria-invalid={errorColor !== null}
                  aria-describedby="color-hex-error"
                />
                {errorColor && <small id="color-hex-error" role="alert" style={{ color: 'var(--color-danger, #B91C1C)', display: 'block', marginTop: '4px' }}>{errorColor}</small>}
              </div>
            </div>
            {!errorColor && <AvisoColorMarca color={color.trim()} />}

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
                      borderColor: color.toUpperCase() === p.hex.toUpperCase() ? 'var(--color-text-main)' : 'var(--color-sidebar-text)',
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
            <div style={{ ...styles.previewBox, marginTop: '20px', border: '2px solid var(--color-text-main)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px' }}>
                <Eye size={14} color={color} />{t('uxAudit.live_preview')} {locale.toUpperCase()})
              </div>
              <div style={{ padding: '16px', backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)', borderRadius: '12px', border: '1px solid var(--color-border-subtle)' }}>
                <div style={{ fontWeight: 800, fontSize: '15px' }}>
                  {nombre || t('settings.name')}
                </div>
                <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.85 }}>{t('uxAudit.currency')} {monedaSimbolo} ({monedaCodigo}{t('uxAudit.tax')} {impuestoNombre} {impuestoTasa}%
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button type="button" style={{ padding: '6px 12px', backgroundColor: color, color: '#FFFFFF', border: 'none', borderRadius: '4px', fontWeight: 800, fontSize: '11px' }}>{t('uxAudit.active_button')} </button>
                  <span className="badge badge-success">{t('uxAudit.system_ok')} </span>
                </div>
              </div>
            </div>

          </section>
          <section className="industrial-card settings-section" style={styles.card} aria-labelledby="settings-section-sales">
            <div style={styles.cardHeader}>
              <Receipt size={20} strokeWidth={2.4} color="var(--color-primary-text)" />
              <h2 id="settings-section-sales" style={{ fontSize: '15px' }}>2. {t('settings.sections.sales')}</h2>
            </div>
            <p className="settings-section-help">{t('settings.sections.sales_help')}</p>
            {/* Formato de impresión: hoja A4 o papel de rollo térmico para facturas, recibos y tickets */}
            <div className="form-group">
              <label className="form-label" htmlFor="formato-impresion" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Receipt size={14} color="var(--color-primary-text)" />
                <span>Formato de impresión de facturas y recibos</span>
              </label>
              <select
                id="formato-impresion" aria-label="Formato de impresión de facturas y recibos" value={formatoImpresion}
                onChange={(e) => setFormatoImpresion(e.target.value as FormatoImpresion)}
                className="form-select"
                style={{ fontWeight: 700 }}
              >
                {FORMATOS_IMPRESION.map(formato => <option key={formato.valor} value={formato.valor}>{formato.etiqueta}</option>)}
              </select>
              <p id="formato-impresion-ayuda" style={{ fontSize: 12, margin: '4px 0 0' }}>
                {FORMATOS_IMPRESION.find(formato => formato.valor === formatoImpresion)?.descripcion}
              </p>
            </div>

            <h3>{t('settings.currency_tax')}</h3><p id="fiscal-limit">{t('settings.fiscal_help')}</p>
            <label htmlFor="currency-code" className="form-label">{t('settings.currency_code')}</label>
            <input id="currency-code" className="form-input" required pattern="[A-Z]{3}" maxLength={3} value={monedaCodigo} readOnly aria-describedby="fiscal-limit" />
            {/* Configuración de Moneda e Impuesto */}
            <div className="settings-fiscal-row" style={{ display: 'flex', gap: '12px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Coins size={14} color="var(--color-primary-text)" />
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
                  <Receipt size={14} color="var(--color-primary-text)" />
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

          </section>
          <section className="industrial-card settings-section" style={styles.card} aria-labelledby="settings-section-team">
            <div style={styles.cardHeader}>
              <Users size={20} strokeWidth={2.4} color="var(--color-primary-text)" />
              <h2 id="settings-section-team" style={{ fontSize: '15px' }}>3. {t('settings.sections.team')}</h2>
            </div>
            <p className="settings-section-help">{t('settings.sections.team_help')}</p>
            <ul className="settings-links">
              <li><Link to={`/admin/negocios/${negocioId}/usuarios`}><Users size={16} aria-hidden="true" />{t('settings.sections.team_users')}</Link></li>
              <li><Link to={`/admin/negocios/${negocioId}/servicios`}><Layers size={16} aria-hidden="true" />{t('settings.sections.team_services')}</Link></li>
            </ul>
          </section>
          <div className="settings-save-bar">
            <div className="settings-save-actions" style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRestablecerDefault}
              >
                <RefreshCw size={14} />{t('uxAudit.reset')} </button>
              <Button type="submit" disabled={saving || errorColor !== null} style={{ flex: 1 }}>
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
    border: '1px solid var(--color-text-main)',
    flexShrink: 0,
  },
  previewBox: {
    backgroundColor: 'var(--color-bg)',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '14px',
  },
};
