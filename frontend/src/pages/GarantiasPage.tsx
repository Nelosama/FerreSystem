import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { CheckCircle, AlertTriangle, Search, ShieldCheck } from 'lucide-react';
import { api } from '../utils/api';
import { formatearFechaNegocio } from '../utils/fechasNegocio';
import { DIAS_GARANTIA_MAX, generarSolicitudId, validarDiasGarantia, vencimientoGarantia } from '../utils/garantias';
import { useI18n } from '../context/I18nContext';
import { useTenant } from '../context/TenantContext';

/** Línea de una factura con su cobertura, tal como la devuelve el backend. */
interface LineaFactura {
  detalleVentaId: string;
  productoId: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  cobertura: Cobertura | null;
}

interface Factura {
  id: string;
  numeroVenta: number;
  fechaVenta: string;
  estado: string;
  cliente: string;
  items: LineaFactura[];
}

interface Cobertura {
  id: string;
  numeroSerie: string | null;
  fechaInicio: string;
  diasGarantia: number;
  fechaVencimiento: string;
  estado: 'VIGENTE' | 'VENCIDA';
}

interface CoberturaListada extends Cobertura {
  numeroVenta: number | null;
  cliente: string | null;
  producto: { id: string; nombre: string; codigo: string } | null;
}

const mensajeDeError = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || fallback;
};

export const GarantiasPage: React.FC = () => {
  const { user, isReadOnly } = useTenant();
  const { t, locale } = useI18n();
  const esAdmin = user?.rol === 'ADMIN';

  // Búsqueda de factura
  const [numero, setNumero] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [factura, setFactura] = useState<Factura | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState('');

  // Alta de garantía
  const [lineaId, setLineaId] = useState<string | null>(null);
  const [dias, setDias] = useState('365');
  const [serie, setSerie] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const [exito, setExito] = useState('');
  // Misma solicitud mientras el formulario no cambie: un reintento no duplica la garantía.
  const solicitud = useRef<{ clave: string; id: string } | null>(null);

  // Consulta de garantías registradas
  const [lista, setLista] = useState<CoberturaListada[]>([]);
  const [q, setQ] = useState('');
  const [cargandoLista, setCargandoLista] = useState(false);
  const [errorLista, setErrorLista] = useState('');

  // Edición de días (solo ADMIN)
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editDias, setEditDias] = useState('');
  const [errorEdicion, setErrorEdicion] = useState('');

  const cargarLista = useCallback(async (termino: string) => {
    setCargandoLista(true);
    setErrorLista('');
    try {
      const res = await api.get('/garantias/coberturas', { params: termino.trim() ? { q: termino.trim() } : {} });
      setLista(res.data);
    } catch (e: any) {
      setErrorLista(mensajeDeError(e, t('warranties.list_error')));
    } finally {
      setCargandoLista(false);
    }
  }, [t]);

  useEffect(() => {
    void cargarLista('');
  }, [cargarLista]);

  const buscarFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBusqueda('');
    setExito('');
    setFactura(null);
    setLineaId(null);
    const n = numero.trim();
    if (!/^\d+$/.test(n)) {
      setErrorBusqueda(t('warranties.invoice_invalid'));
      return;
    }
    setBuscando(true);
    try {
      const res = await api.get(`/garantias/facturas/${n}`);
      setFactura(res.data);
    } catch (err: any) {
      setErrorBusqueda(err?.response?.status === 404 ? t('warranties.invoice_not_found') : mensajeDeError(err, t('warranties.search_error')));
    } finally {
      setBuscando(false);
    }
  };

  const linea = factura?.items.find((i) => i.detalleVentaId === lineaId) ?? null;
  const diasValidos = validarDiasGarantia(dias);
  const puedeGuardar = esAdmin && !isReadOnly && !!linea && !linea.cobertura && diasValidos !== null && !guardando;

  const seleccionarLinea = (detalleVentaId: string) => {
    setLineaId(detalleVentaId);
    setExito('');
    setErrorGuardar('');
    solicitud.current = null;
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factura || !linea || diasValidos === null) return;
    const clave = JSON.stringify([factura.id, linea.detalleVentaId, diasValidos, serie.trim().toUpperCase()]);
    if (!solicitud.current || solicitud.current.clave !== clave) solicitud.current = { clave, id: generarSolicitudId() };
    setGuardando(true);
    setErrorGuardar('');
    try {
      const res = await api.post('/garantias/coberturas', {
        ventaId: factura.id,
        detalleVentaId: linea.detalleVentaId,
        diasGarantia: diasValidos,
        numeroSerie: serie.trim() || undefined,
        solicitudId: solicitud.current.id,
      });
      solicitud.current = null;
      setExito(`${t('warranties.saved')} ${formatearFechaNegocio(res.data.fechaVencimiento, locale)}`);
      setFactura({
        ...factura,
        items: factura.items.map((i) => (i.detalleVentaId === linea.detalleVentaId ? { ...i, cobertura: res.data } : i)),
      });
      setSerie('');
      void cargarLista(q);
    } catch (err: any) {
      setErrorGuardar(mensajeDeError(err, t('warranties.save_error')));
    } finally {
      setGuardando(false);
    }
  };

  const guardarDias = async (id: string) => {
    const valor = validarDiasGarantia(editDias);
    if (valor === null) {
      setErrorEdicion(t('warranties.days_error'));
      return;
    }
    setErrorEdicion('');
    try {
      await api.patch(`/garantias/coberturas/${id}`, { diasGarantia: valor });
      setEditandoId(null);
      void cargarLista(q);
    } catch (err: any) {
      setErrorEdicion(mensajeDeError(err, t('warranties.save_error')));
    }
  };

  return (
    <div style={styles.container}>
      <TopBar title={t('warranties.title')} subtitle={t('warranties.subtitle')} />

      <main style={styles.content}>
        {/* 1. Buscar factura */}
        <section style={styles.card} aria-labelledby="gar-buscar">
          <h2 id="gar-buscar" style={styles.h2}>{t('warranties.step_find')}</h2>
          <form onSubmit={buscarFactura} style={styles.fila}>
            <input
              type="text"
              inputMode="numeric"
              className="form-input"
              placeholder={t('warranties.invoice_placeholder')}
              aria-label={t('warranties.invoice_number')}
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button type="submit" className="btn btn-primary" disabled={buscando || !numero.trim()}>
              <Search size={16} /> {buscando ? t('warranties.searching') : t('warranties.search_invoice')}
            </button>
          </form>
          {errorBusqueda && <p role="alert" style={styles.error}>{errorBusqueda}</p>}
          {!esAdmin && <p style={styles.meta}>{t('warranties.admin_only_create')}</p>}
        </section>

        {/* 2. Factura y productos */}
        {factura && (
          <section style={styles.card} aria-labelledby="gar-factura">
            <h2 id="gar-factura" style={styles.h2}>
              {t('warranties.invoice_label')} #{factura.numeroVenta}
            </h2>
            <p style={styles.meta}>
              {t('warranties.client_label')}: <strong>{factura.cliente}</strong> · {t('warranties.date_label')}:{' '}
              <strong>{formatearFechaNegocio(factura.fechaVenta, locale)}</strong>
            </p>
            {factura.estado !== 'COMPLETADA' && <p role="alert" style={styles.error}>{t('warranties.invoice_not_completed')}</p>}

            <p style={styles.label}>{t('warranties.select_product')}</p>
            <ul style={styles.lista}>
              {factura.items.map((item) => {
                const seleccionada = item.detalleVentaId === lineaId;
                return (
                  <li key={item.detalleVentaId}>
                    <button
                      type="button"
                      onClick={() => seleccionarLinea(item.detalleVentaId)}
                      disabled={!esAdmin || !!item.cobertura}
                      aria-pressed={seleccionada}
                      style={{ ...styles.opcion, ...(seleccionada ? styles.opcionActiva : {}) }}
                    >
                      <span style={{ fontWeight: 700 }}>{item.nombre}</span>
                      <span style={styles.meta}>{item.codigo} · {t('warranties.quantity')}: {item.cantidad}</span>
                      {item.cobertura ? (
                        <span style={styles.meta}>
                          {t('warranties.already_covered')} · {t('warranties.expires_on')}{' '}
                          {formatearFechaNegocio(item.cobertura.fechaVencimiento, locale)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* 3. Días y vencimiento */}
            {linea && !linea.cobertura && esAdmin && (
              <form onSubmit={guardar} style={{ marginTop: 16 }}>
                <div style={styles.fila}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label className="form-label" htmlFor="gar-dias">{t('warranties.warranty_duration')}</label>
                    <input
                      id="gar-dias"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={DIAS_GARANTIA_MAX}
                      step={1}
                      className="form-input"
                      value={dias}
                      onChange={(e) => { setDias(e.target.value); setErrorGuardar(''); solicitud.current = null; }}
                      aria-invalid={diasValidos === null ? true : undefined}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label className="form-label" htmlFor="gar-serie">{t('warranties.serial_optional')}</label>
                    <input
                      id="gar-serie"
                      type="text"
                      className="form-input"
                      value={serie}
                      onChange={(e) => { setSerie(e.target.value); solicitud.current = null; }}
                      maxLength={100}
                    />
                  </div>
                </div>

                {diasValidos !== null ? (
                  <div style={styles.vistaPrevia} aria-live="polite">
                    <div><span style={styles.meta}>{t('warranties.start_date')}: </span><strong>{formatearFechaNegocio(factura.fechaVenta, locale)}</strong></div>
                    <div><span style={styles.meta}>{t('warranties.days_label')}: </span><strong>{diasValidos} {t('warranties.days_unit')}</strong></div>
                    <div><span style={styles.meta}>{t('warranties.expires_on')}: </span><strong>{formatearFechaNegocio(vencimientoGarantia(factura.fechaVenta, diasValidos), locale)}</strong></div>
                  </div>
                ) : (
                  <p role="alert" style={styles.error}>{t('warranties.days_error')}</p>
                )}

                {errorGuardar && <p role="alert" style={styles.error}>{errorGuardar}</p>}
                <button type="submit" className="btn btn-primary" disabled={!puedeGuardar} style={{ marginTop: 12, width: '100%' }}>
                  <ShieldCheck size={16} /> {guardando ? t('warranties.saving') : t('warranties.save')}
                </button>
              </form>
            )}
            {exito && <p role="status" style={styles.exito}><CheckCircle size={14} /> {exito}</p>}
          </section>
        )}

        {/* 4. Garantías registradas */}
        <section style={styles.card} aria-labelledby="gar-lista">
          <h2 id="gar-lista" style={styles.h2}>{t('warranties.registered_title')}</h2>
          <form onSubmit={(e) => { e.preventDefault(); void cargarLista(q); }} style={styles.fila}>
            <input
              type="text"
              className="form-input"
              placeholder={t('warranties.list_search')}
              aria-label={t('warranties.list_search')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button type="submit" className="btn btn-secondary" disabled={cargandoLista}>
              <Search size={16} /> {t('warranties.list_filter')}
            </button>
          </form>
          {errorLista && <p role="alert" style={styles.error}>{errorLista}</p>}
          {cargandoLista && <p role="status" style={styles.meta}>{t('warranties.loading')}</p>}
          {!cargandoLista && !lista.length && !errorLista && <p style={styles.meta}>{t('warranties.empty_list')}</p>}

          <ul style={styles.lista}>
            {lista.map((g) => (
              <li key={g.id} style={styles.registro}>
                <div style={styles.fila}>
                  <strong style={{ flex: 1 }}>{g.producto?.nombre ?? '—'}</strong>
                  <span className={g.estado === 'VIGENTE' ? 'badge badge-success' : 'badge badge-danger'}>
                    {g.estado === 'VIGENTE' ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}{' '}
                    {g.estado === 'VIGENTE' ? t('warranties.status_valid') : t('warranties.status_expired')}
                  </span>
                </div>
                <div style={styles.meta}>
                  {t('warranties.invoice_label')} #{g.numeroVenta ?? '—'} · {g.cliente ?? t('warranties.final_consumer')}
                  {g.numeroSerie ? ` · S/N ${g.numeroSerie}` : ''}
                </div>
                <div style={styles.meta}>
                  {t('warranties.start_date')}: {formatearFechaNegocio(g.fechaInicio, locale)} · {g.diasGarantia} {t('warranties.days_unit')} · {t('warranties.expires_on')}: <strong>{formatearFechaNegocio(g.fechaVencimiento, locale)}</strong>
                </div>

                {esAdmin && editandoId !== g.id && (
                  <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => { setEditandoId(g.id); setEditDias(String(g.diasGarantia)); setErrorEdicion(''); }}>
                    {t('warranties.edit_days')}
                  </button>
                )}
                {esAdmin && editandoId === g.id && (
                  <div style={{ marginTop: 8 }}>
                    <div style={styles.fila}>
                      <input type="number" inputMode="numeric" min={1} max={DIAS_GARANTIA_MAX} step={1} className="form-input" aria-label={t('warranties.days_label')} value={editDias} onChange={(e) => setEditDias(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                      <button type="button" className="btn btn-primary" onClick={() => void guardarDias(g.id)}>{t('warranties.save_days')}</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditandoId(null)}>{t('warranties.cancel')}</button>
                    </div>
                    {errorEdicion && <p role="alert" style={styles.error}>{errorEdicion}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: '100vh', backgroundColor: 'var(--color-bg)' },
  content: { padding: '16px', maxWidth: '900px', width: '100%', margin: '0 auto', display: 'grid', gap: '16px', boxSizing: 'border-box' },
  card: { backgroundColor: 'var(--color-surface, #fff)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '16px', minWidth: 0 },
  h2: { fontSize: '15px', textTransform: 'uppercase', margin: '0 0 12px' },
  fila: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' },
  label: { fontSize: '12px', fontWeight: 700, margin: '12px 0 6px', textTransform: 'uppercase' },
  meta: { fontSize: '12px', color: 'var(--color-text-muted)', display: 'block', marginTop: 2 },
  error: { color: '#B91C1C', fontSize: '13px', margin: '8px 0 0' },
  exito: { color: '#047857', fontSize: '13px', fontWeight: 700, marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 },
  lista: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' },
  opcion: { width: '100%', textAlign: 'left', display: 'grid', gap: 2, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', color: 'inherit' },
  opcionActiva: { borderColor: '#0284C7', boxShadow: '0 0 0 2px rgba(2,132,199,0.25)' },
  registro: { border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px' },
  vistaPrevia: { marginTop: 12, padding: '10px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: '13px', display: 'grid', gap: 4 },
};
