import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { Rubro } from '../types';
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
  const { locale, setLocale } = useI18n();

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
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);

  // Sincronizar estados cuando el tenant del contexto cambie o cargue
  React.useEffect(() => {
    if (tenant) {
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
    const updatedImpuesto = { nombre: impuestoNombre, tasa: parseFloat(impuestoTasa) || 15 };

    try {
      await api.put('/tenant/settings', {
        nombreComercial: nombre,
        direccion,
        telefono,
        email,
        colorPrimario: color,
        logoUrl: logoUrl.trim() || null,
      });

      updateTenantConfig({
        nombreComercial: nombre,
        sucursal,
        logoUrl: logoUrl.trim() || null,
        colorPrimario: color,
        rubro,
        estiloUI,
        modoNavegacion,
        fuenteTitulos,
        fuenteCuerpo,
        moneda: updatedMoneda,
        impuesto: updatedImpuesto,
        direccion,
        telefono,
        email,
      });

      setGuardadoExitoso(true);
      setTimeout(() => setGuardadoExitoso(false), 4000);
    } catch (err: any) {
      console.error('Error al guardar configuración del tenant:', err);
      alert(err.response?.data?.message || 'Error al guardar la configuración en el servidor.');
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
    updateTenantConfig({
      nombreComercial: nombre,
      sucursal,
      colorPrimario: '#EA580C',
      rubro,
      estiloUI: 'INDUSTRIAL',
      fuenteTitulos: 'Archivo',
      fuenteCuerpo: 'Inter',
      moneda: { simbolo: 'L.', codigo: 'HNL' },
      impuesto: { nombre: 'ISV', tasa: 15 },
      direccion,
      telefono,
      email,
    });
  };

  return (
    <div style={styles.container}>
      <TopBar title="CONFIGURACIÓN Y MARCA" subtitle="Personalización White-Label por Tenant" />

      <main style={styles.content}>

        {guardadoExitoso && (
          <div style={styles.successBanner}>
            <Check size={20} strokeWidth={2.6} color="#15803D" />
            <span style={{ fontWeight: 700 }}>
              ¡Configuración de marca, idioma y fiscal guardadas correctamente para "{nombre}"!
            </span>
          </div>
        )}

        <form onSubmit={handleGuardar} style={styles.grid}>
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
                    backgroundColor: locale === 'es' ? 'var(--color-sidebar-bg)' : 'var(--color-bg)',
                    color: locale === 'es' ? 'var(--color-bg)' : 'var(--color-sidebar-bg)',
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
                    backgroundColor: locale === 'en' ? 'var(--color-sidebar-bg)' : 'var(--color-bg)',
                    color: locale === 'en' ? 'var(--color-bg)' : 'var(--color-sidebar-bg)',
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
                value={nombre}
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
                value={logoUrl}
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
                value={rubro}
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

            {/* Configuración de Moneda e Impuesto */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Coins size={14} color="var(--color-primary)" />
                  <span>SÍMBOLO MONEDA</span>
                </label>
                <input
                  type="text"
                  required
                  value={monedaSimbolo}
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
                    value={impuestoNombre}
                    onChange={(e) => setImpuestoNombre(e.target.value)}
                    className="form-input"
                    style={{ width: '70px', fontWeight: 800 }}
                  />
                  <input
                    type="number"
                    required
                    value={impuestoTasa}
                    onChange={(e) => setImpuestoTasa(e.target.value)}
                    className="form-input"
                    style={{ fontWeight: 800 }}
                  />
                  <span style={{ fontWeight: 800 }}>%</span>
                </div>
              </div>
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
                  onClick={() => setModoNavegacion('SIDEBAR')}
                  style={{
                    padding: '10px',
                    backgroundColor: modoNavegacion === 'SIDEBAR' ? 'var(--color-sidebar-bg)' : 'var(--color-bg)',
                    color: modoNavegacion === 'SIDEBAR' ? 'var(--color-bg)' : 'var(--color-sidebar-bg)',
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
                  onClick={() => setModoNavegacion('TOPNAV')}
                  style={{
                    padding: '10px',
                    backgroundColor: modoNavegacion === 'TOPNAV' ? 'var(--color-sidebar-bg)' : 'var(--color-bg)',
                    color: modoNavegacion === 'TOPNAV' ? 'var(--color-bg)' : 'var(--color-sidebar-bg)',
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

            {/* Tipografía de Títulos y Cuerpo */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Type size={14} color="var(--color-primary)" />
                  <span>FUENTE TÍTULOS</span>
                </label>
                <select
                  value={fuenteTitulos}
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
                  value={fuenteCuerpo}
                  onChange={(e) => setFuenteCuerpo(e.target.value as any)}
                  className="form-select"
                >
                  <option value="Inter">Inter (Estándar UI)</option>
                  <option value="IBM Plex Sans">IBM Plex Sans (Técnico)</option>
                  <option value="Nunito Sans">Nunito Sans (Redondeado)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Columna Derecha: White-Labeling y Selector de Color Primario & Preview */}
          <div className="industrial-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <Palette size={20} strokeWidth={2.4} color="var(--color-primary)" />
              <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>COLOR DE MARCA & VISTA PREVIA EN VIVO</h2>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '12px' }}>
              El color seleccionado se inyecta en variables CSS globales (`--color-primary`) afectando el sidebar,
              botones primarios, bordes de alerta y documentos PDF.
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
                  backgroundColor: estiloUI === 'MINIMALISTA' ? 'var(--color-surface-hover)' : estiloUI === 'MODERNO' ? color : 'var(--color-sidebar-bg)',
                  color: estiloUI === 'MINIMALISTA' ? 'var(--color-sidebar-bg)' : '#FFFFFF',
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

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRestablecerDefault}
              >
                <RefreshCw size={14} /> RESTABLECER
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                <Check size={16} strokeWidth={2.6} /> APLICAR CAMBIOS
              </button>
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
