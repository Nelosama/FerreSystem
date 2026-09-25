import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { Palette, Building2, Check, RefreshCw, AlertTriangle, Image as ImageIcon } from 'lucide-react';

const PRESET_COLORS = [
  { name: 'Naranja Óxido (FerreSystem)', hex: '#EA580C' },
  { name: 'Rojo Industrial Ferretero', hex: '#DC2626' },
  { name: 'Azul Acero Profesional', hex: '#0284C7' },
  { name: 'Amarillo Seguridad CAT', hex: '#D97706' },
  { name: 'Verde Taller / Ferretería', hex: '#16A34A' },
  { name: 'Gris Grafito Minimalista', hex: '#4B5563' },
];

export const ConfiguracionPage: React.FC = () => {
  const { tenant, updateBranding } = useTenant();

  const [nombre, setNombre] = useState(tenant.nombreComercial);
  const [color, setColor] = useState(tenant.colorPrimario);
  const [direccion, setDireccion] = useState('Barrio El Centro, 3ra Ave, 4ta Calle, San Pedro Sula');
  const [telefono, setTelefono] = useState('+504 2550-1234');
  const [email, setEmail] = useState('ventas@lamundial.hn');
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);

  // Validación de contraste básica WCAG contra texto blanco
  const contrastRatio = getLuminance(color);
  const isLowContrast = contrastRatio > 0.7; // Si el color es demasiado claro para texto blanco

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    updateBranding(color, nombre);
    setGuardadoExitoso(true);
    setTimeout(() => setGuardadoExitoso(false), 4000);
  };

  const handleRestablecerDefault = () => {
    setColor('#EA580C');
    updateBranding('#EA580C', nombre);
  };

  return (
    <div style={styles.container}>
      <TopBar title="CONFIGURACIÓN Y MARCA" subtitle="Personalización White-Label por Tenant" />

      <main style={styles.content}>
        {guardadoExitoso && (
          <div style={styles.successBanner}>
            <Check size={20} strokeWidth={2.6} color="#15803D" />
            <span style={{ fontWeight: 700 }}>
              ¡Marca y variables CSS actualizadas en tiempo real en todo el sistema!
            </span>
          </div>
        )}

        <form onSubmit={handleGuardar} style={styles.grid}>
          {/* Columna Izquierda: Identidad y Datos del Negocio */}
          <div className="industrial-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <Building2 size={20} strokeWidth={2.4} color="var(--color-primary)" />
              <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>DATOS COMERCIALES DE LA FERRETERÍA</h2>
            </div>

            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label">NOMBRE COMERCIAL (APARECE EN SIDEBAR Y FACTURAS)</label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">DIRECCIÓN FÍSICA</label>
              <input
                type="text"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                className="form-input"
              />
            </div>

            <div style={{ display: 'flex', gap: '14px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">TELÉFONO DE CONTACTO</label>
                <input
                  type="text"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">EMAIL DE NOTIFICACIONES</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '8px' }}>
              <label className="form-label">LOGOTIPO DEL TENANT (SUPABASE STORAGE)</label>
              <div style={styles.logoDropArea}>
                <ImageIcon size={32} strokeWidth={1.5} color="#78716C" />
                <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '6px' }}>
                  Haga clic para subir logo de su ferretería
                </div>
                <div style={{ fontSize: '10px', color: '#78716C' }}>PNG, JPG o SVG (Máximo 2MB)</div>
              </div>
            </div>
          </div>

          {/* Columna Derecha: White-Labeling y Selector de Color Primario */}
          <div className="industrial-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <Palette size={20} strokeWidth={2.4} color="var(--color-primary)" />
              <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>COLOR DE MARCA (WHITE-LABEL)</h2>
            </div>

            <p style={{ fontSize: '12px', color: '#78716C', marginTop: '12px' }}>
              El color seleccionado se inyecta en variables CSS globales (`--color-primary`) afectando de inmediato
              el sidebar, botones primarios, bordes de alerta y documentos PDF.
            </p>

            {/* Selector de color HEX interactivo */}
            <div style={styles.colorPickerRow}>
              <input
                type="color"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  updateBranding(e.target.value, nombre);
                }}
                style={styles.nativeColorInput}
              />
              <div style={{ flex: 1 }}>
                <label className="form-label">CÓDIGO HEXADECIMAL</label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => {
                    setColor(e.target.value);
                    if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                      updateBranding(e.target.value, nombre);
                    }
                  }}
                  className="form-input"
                  style={{ fontFamily: 'monospace', fontWeight: 700 }}
                />
              </div>
            </div>

            {/* Advertencia de accesibilidad WCAG si el contraste es muy bajo */}
            {isLowContrast && (
              <div style={styles.warningBox}>
                <AlertTriangle size={16} strokeWidth={2.5} color="#C2410C" />
                <span style={{ fontSize: '11px', color: '#C2410C', fontWeight: 600 }}>
                  Aviso WCAG: Este color es muy claro. Los botones con texto blanco podrían tener bajo contraste.
                </span>
              </div>
            )}

            {/* Paletas recomendadas */}
            <div style={{ marginTop: '16px' }}>
              <label className="form-label">PALETAS INDUSTRIALES VALIDADAS</label>
              <div style={styles.presetsGrid}>
                {PRESET_COLORS.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => {
                      setColor(p.hex);
                      updateBranding(p.hex, nombre);
                    }}
                    style={{
                      ...styles.presetBtn,
                      borderColor: color.toUpperCase() === p.hex.toUpperCase() ? '#1C1917' : '#D6D3D1',
                      borderWidth: color.toUpperCase() === p.hex.toUpperCase() ? '2.5px' : '1.5px',
                    }}
                  >
                    <span style={{ ...styles.colorCircle, backgroundColor: p.hex }} />
                    <span style={{ fontSize: '11px', fontWeight: 700 }}>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Vista previa en vivo */}
            <div style={styles.previewBox}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase' }}>
                VISTA PREVIA DE BOTÓN ACTIVO
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="btn btn-primary btn-sm">
                  BOTÓN PRIMARIO
                </button>
                <button type="button" className="btn btn-secondary btn-sm">
                  SECUNDARIO
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRestablecerDefault}
              >
                <RefreshCw size={14} /> POR DEFECTO (#EA580C)
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

// Estimación simple de luminancia para validar contraste WCAG
function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return 0.5;
  const r = parseInt(cleanHex.substr(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substr(2, 2), 16) / 255;
  const b = parseInt(cleanHex.substr(4, 2), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

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
  logoDropArea: {
    border: '2px dashed var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '24px',
    textAlign: 'center',
    backgroundColor: '#FAFAF9',
    cursor: 'pointer',
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
  warningBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: '#FFEDD5',
    border: '1.5px solid var(--color-primary)',
    borderRadius: 'var(--radius-xs)',
    marginTop: '10px',
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
    border: '1px solid #1C1917',
    flexShrink: 0,
  },
  previewBox: {
    backgroundColor: '#FAFAF9',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '14px',
    marginTop: '18px',
  },
};
