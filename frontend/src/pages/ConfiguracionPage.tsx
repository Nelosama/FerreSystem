import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
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

  // Cargar lista de tenants registradas en el SaaS
  const [tenantsList, setTenantsList] = useState<any[]>(() => {
    const saved = localStorage.getItem('ferre_saas_tenants');
    return saved
      ? JSON.parse(saved)
      : [
          {
            id: 't-1',
            nombreComercial: 'LA MUNDIAL - SUCURSAL CENTRO',
            contacto: 'admin@lamundial.hn',
            telefono: '+504 2550-1234',
            colorPrimario: '#EA580C',
            rubro: Rubro.FERRETERIA,
            estiloUI: 'INDUSTRIAL',
            fuenteTitulos: 'Archivo',
            fuenteCuerpo: 'Inter',
            moneda: { simbolo: 'L.', codigo: 'HNL' },
            impuesto: { nombre: 'ISV', tasa: 15 },
            direccion: 'Barrio El Centro, 3ra Ave, 4ta Calle, San Pedro Sula',
          },
          {
            id: 't-2',
            nombreComercial: 'FERRETERÍA EL MARTILLO DE ORO',
            contacto: 'admin@elmartillodeoro.hn',
            telefono: '+504 2233-4455',
            colorPrimario: '#0284C7',
            rubro: Rubro.FERRETERIA,
            estiloUI: 'MINIMALISTA',
            fuenteTitulos: 'Poppins',
            fuenteCuerpo: 'Inter',
            moneda: { simbolo: 'L.', codigo: 'HNL' },
            impuesto: { nombre: 'ISV', tasa: 15 },
            direccion: 'Col. Palmira, Ave. República de Chile, Tegucigalpa',
          },
        ];
  });

  const [selectedTenantId, setSelectedTenantId] = useState<string>(
    tenantsList[0]?.id || tenant.id || 't-1',
  );

  const currentSelectedTenant =
    tenantsList.find((t) => t.id === selectedTenantId) || tenantsList[0] || tenant;

  const [nombre, setNombre] = useState(currentSelectedTenant.nombreComercial);
  const [sucursal, setSucursal] = useState(currentSelectedTenant.sucursal || 'Sucursal Principal');
  const [color, setColor] = useState(currentSelectedTenant.colorPrimario || '#EA580C');
  const [rubro, setRubro] = useState<Rubro>((currentSelectedTenant.rubro || tenant.rubro || Rubro.FERRETERIA) as Rubro);
  const [estiloUI, setEstiloUI] = useState<'INDUSTRIAL' | 'MINIMALISTA' | 'MODERNO'>(
    (currentSelectedTenant.estiloUI || tenant.estiloUI || 'INDUSTRIAL') as any,
  );
  const [fuenteTitulos, setFuenteTitulos] = useState<'Archivo' | 'Space Grotesk' | 'Poppins' | 'Montserrat'>(
    (currentSelectedTenant.fuenteTitulos || tenant.fuenteTitulos || 'Archivo') as any,
  );
  const [fuenteCuerpo, setFuenteCuerpo] = useState<'Inter' | 'IBM Plex Sans' | 'Nunito Sans'>(
    (currentSelectedTenant.fuenteCuerpo || tenant.fuenteCuerpo || 'Inter') as any,
  );

  // Moneda e Impuesto
  const [monedaSimbolo, setMonedaSimbolo] = useState(currentSelectedTenant.moneda?.simbolo || 'L.');
  const [monedaCodigo, setMonedaCodigo] = useState(currentSelectedTenant.moneda?.codigo || 'HNL');
  const [impuestoNombre, setImpuestoNombre] = useState(currentSelectedTenant.impuesto?.nombre || 'ISV');
  const [impuestoTasa, setImpuestoTasa] = useState(currentSelectedTenant.impuesto?.tasa?.toString() || '15');

  const [direccion, setDireccion] = useState(
    currentSelectedTenant.direccion || 'Barrio El Centro, San Pedro Sula',
  );
  const [telefono, setTelefono] = useState(currentSelectedTenant.telefono || '+504 2550-1234');
  const [email, setEmail] = useState(
    currentSelectedTenant.contacto || currentSelectedTenant.email || 'contacto@ferreteria.hn',
  );
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);

  // Cuando cambia el tenant seleccionado en el combo
  React.useEffect(() => {
    if (currentSelectedTenant) {
      setNombre(currentSelectedTenant.nombreComercial);
      setSucursal(currentSelectedTenant.sucursal || 'Sucursal Principal');
      setColor(currentSelectedTenant.colorPrimario || '#EA580C');
      setRubro((currentSelectedTenant.rubro || Rubro.FERRETERIA) as Rubro);
      setEstiloUI((currentSelectedTenant.estiloUI || 'INDUSTRIAL') as any);
      setFuenteTitulos((currentSelectedTenant.fuenteTitulos || 'Archivo') as any);
      setFuenteCuerpo((currentSelectedTenant.fuenteCuerpo || 'Inter') as any);
      setMonedaSimbolo(currentSelectedTenant.moneda?.simbolo || 'L.');
      setMonedaCodigo(currentSelectedTenant.moneda?.codigo || 'HNL');
      setImpuestoNombre(currentSelectedTenant.impuesto?.nombre || 'ISV');
      setImpuestoTasa(currentSelectedTenant.impuesto?.tasa?.toString() || '15');
      setDireccion(
        currentSelectedTenant.direccion || 'Barrio El Centro, San Pedro Sula',
      );
      setTelefono(currentSelectedTenant.telefono || '+504 2550-1234');
      setEmail(
        currentSelectedTenant.contacto || currentSelectedTenant.email || 'contacto@ferreteria.hn',
      );
    }
  }, [selectedTenantId]);

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedMoneda = { simbolo: monedaSimbolo, codigo: monedaCodigo };
    const updatedImpuesto = { nombre: impuestoNombre, tasa: parseFloat(impuestoTasa) || 15 };

    // Actualizar lista de tenants en SaaS
    const updatedList = tenantsList.map((t) =>
      t.id === selectedTenantId
        ? {
            ...t,
            nombreComercial: nombre,
            sucursal,
            colorPrimario: color,
            rubro,
            estiloUI,
            fuenteTitulos,
            fuenteCuerpo,
            moneda: updatedMoneda,
            impuesto: updatedImpuesto,
            direccion,
            telefono,
            contacto: email,
            email,
          }
        : t,
    );

    setTenantsList(updatedList);
    localStorage.setItem('ferre_saas_tenants', JSON.stringify(updatedList));

    // Si coincide con la empresa activa actual, actualizar context también
    if (selectedTenantId === tenant.id || nombre === tenant.nombreComercial) {
      updateTenantConfig({
        nombreComercial: nombre,
        sucursal,
        colorPrimario: color,
        rubro,
        estiloUI,
        fuenteTitulos,
        fuenteCuerpo,
        moneda: updatedMoneda,
        impuesto: updatedImpuesto,
        direccion,
        telefono,
        email,
      });
    }

    setGuardadoExitoso(true);
    setTimeout(() => setGuardadoExitoso(false), 4000);
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
        {/* Selector de Empresa para Super Admin */}
        <div
          className="industrial-card"
          style={{
            padding: '16px 20px',
            marginBottom: '20px',
            backgroundColor: '#1C1917',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: '13px',
                color: '#EA580C',
                textTransform: 'uppercase',
              }}
            >
              SELECCIONAR CLIENTE / EMPRESA A CONFIGURAR
            </div>
            <div style={{ fontSize: '11px', color: '#A8A29E' }}>
              Elija la empresa para modificar su marca, rubro, idioma, tema visual y paleta de color.
            </div>
          </div>

          <div style={{ minWidth: '280px' }}>
            <select
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className="form-select"
              style={{
                backgroundColor: '#292524',
                color: '#FAFAF9',
                borderColor: '#44403C',
                fontWeight: 700,
              }}
            >
              {tenantsList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombreComercial}
                </option>
              ))}
            </select>
          </div>
        </div>

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
                    backgroundColor: locale === 'es' ? '#1C1917' : '#FAFAF9',
                    color: locale === 'es' ? '#FAFAF9' : '#1C1917',
                    border: '1.5px solid #1C1917',
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
                    backgroundColor: locale === 'en' ? '#1C1917' : '#FAFAF9',
                    color: locale === 'en' ? '#FAFAF9' : '#1C1917',
                    border: '1.5px solid #1C1917',
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

            {/* Selector de Estilo de Interfaz (3 Temas) */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layout size={14} color="var(--color-primary)" />
                <span>ESTILO DE INTERFAZ / TEMA DE DISEÑO</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '6px' }}>
                {[
                  { key: 'INDUSTRIAL', name: 'INDUSTRIAL', desc: 'Sidebar charcoal, bordes 2px duros' },
                  { key: 'MINIMALISTA', name: 'MINIMALISTA', desc: 'Sidebar claro, bordes 1px, esquinas 10px' },
                  { key: 'MODERNO', name: 'MODERNO', desc: 'Sidebar color primario, bordes suaves 12px' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setEstiloUI(item.key as any)}
                    style={{
                      padding: '10px 8px',
                      backgroundColor: estiloUI === item.key ? '#1C1917' : '#FAFAF9',
                      color: estiloUI === item.key ? '#FAFAF9' : '#1C1917',
                      border: estiloUI === item.key ? '2px solid #EA580C' : '1.5px solid #D6D3D1',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: '11px' }}>{item.name}</div>
                    <div style={{ fontSize: '9px', color: estiloUI === item.key ? '#A8A29E' : '#78716C', marginTop: '2px' }}>
                      {item.desc}
                    </div>
                  </button>
                ))}
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

            <p style={{ fontSize: '12px', color: '#78716C', marginTop: '12px' }}>
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

            {/* VISTA PREVIA EN VIVO DEL TEMA Y FUENTES */}
            <div style={{ ...styles.previewBox, marginTop: '20px', border: '2px solid #1C1917' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px' }}>
                <Eye size={14} color={color} /> VISTA PREVIA EN VIVO ({locale.toUpperCase()})
              </div>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: estiloUI === 'MINIMALISTA' ? '#F5F5F4' : estiloUI === 'MODERNO' ? color : '#1C1917',
                  color: estiloUI === 'MINIMALISTA' ? '#1C1917' : '#FFFFFF',
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
    border: '1px solid #1C1917',
    flexShrink: 0,
  },
  previewBox: {
    backgroundColor: '#FAFAF9',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '14px',
  },
};
