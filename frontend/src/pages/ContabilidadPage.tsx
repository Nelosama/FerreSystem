import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { useTenant } from '../context/TenantContext';
import { api } from '../utils/api';
import { diaCalendarioEnZona, formatLempiras } from '../utils/format';
import type { Pestana } from '../utils/contabilidad';
import {
  PESTANAS, consultaPeriodo, etiquetaHallazgo, importeOpcional, mensajeError, nombreArchivo, numeroFiscalValido, periodoAnterior, prepararAsiento,
} from '../utils/contabilidad';
import './OperacionesPage.css';

// Contabilidad y Control Tributario (Honduras, fase 1). Todo cálculo y autorización ocurre en el servidor:
// esta pantalla solo consulta, registra documentos fiscales y descarga lo que el servidor genera.
// Nunca modifica ventas, cobros, inventario ni caja.

type Fila = Record<string, any>;
const TIPOS = ['01', '04', '05', '06', '07', '09', '10', '11', '12'];
const IMPORTES = ['importeExento', 'importeExonerado', 'importeGravadoGeneral', 'importeGravadoEspecial', 'isvGeneral', 'isvEspecial'] as const;
const L = (v: unknown) => formatLempiras(Number(v ?? 0));

export const ContabilidadPage: React.FC = () => {
  const { t } = useI18n();
  const { user } = useTenant();
  const puede = useCallback((permiso: string) => user?.rol === 'ADMIN' || !user?.permisosConfigurados || !!user?.permisos?.includes(permiso), [user]);
  const [periodo, setPeriodo] = useState(() => periodoAnterior(diaCalendarioEnZona()));
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [datos, setDatos] = useState<Record<string, any>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  // Un fallo al consultar oculta los datos; un fallo al guardar se informa sin perder lo escrito en el formulario.
  const [errorCarga, setErrorCarga] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const q = consultaPeriodo(periodo);

  const cargar = useCallback(async () => {
    setCargando(true); setErrorCarga('');
    const rutas: Record<Pestana, Record<string, string>> = {
      resumen: { isv: `/contabilidad/resumen-isv?${q}`, conciliacion: `/contabilidad/conciliacion?${q}` },
      ventas: { libro: `/contabilidad/libros/ventas?${q}` },
      compras: { libro: `/contabilidad/libros/compras?${q}` },
      documentos: { documentos: `/contabilidad/documentos?${q}` },
      retenciones: { retenciones: `/contabilidad/retenciones?${q}`, documentos: `/contabilidad/documentos?${q}`, configuracion: '/contabilidad/configuracion' },
      configuracion: { configuracion: '/contabilidad/configuracion' },
      periodos: { periodos: `/contabilidad/periodos?anio=${periodo.anio}` },
      partida: { cuentas: '/contabilidad/cuentas', asientos: `/contabilidad/asientos?${q}`, balanza: `/contabilidad/balanza?${q}` },
      ajustes: { ajustes: `/contabilidad/ajustes?${q}` },
    };
    try {
      const entradas = await Promise.all(Object.entries(rutas[pestana]).map(async ([k, ruta]) => [k, (await api.get(ruta)).data] as const));
      setDatos(Object.fromEntries(entradas));
    } catch (e) {
      setDatos({});
      setErrorCarga(mensajeError(e, t, t('accounting.load_error')));
    } finally { setCargando(false); }
  }, [pestana, q, periodo.anio, t]);

  useEffect(() => { void cargar(); }, [cargar]);

  const enviar = async (fn: () => Promise<unknown>, ok: string) => {
    if (enviando) return false;
    setEnviando(true); setError(''); setMensaje('');
    try { await fn(); setMensaje(ok); await cargar(); return true; }
    catch (e) { setError(mensajeError(e, t, t('accounting.save_error'))); return false; }
    finally { setEnviando(false); }
  };

  const exportar = async (reporte: string, formato: 'csv' | 'xlsx' | 'pdf') => {
    setError('');
    try {
      const res = await api.get(`/contabilidad/exportar/${reporte}?${q}&formato=${formato}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombreArchivo(res.headers['content-disposition'], `${reporte}.${formato}`);
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { setError(mensajeError(e, t, t('accounting.export_error'))); }
  };

  const reporteDe: Partial<Record<Pestana, string>> = { resumen: 'conciliacion', ventas: 'ventas', compras: 'compras', partida: 'balanza' };
  const mesValor = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`;

  return (
    <div className="operation-page" data-testid="contabilidad-page">
      <h1>{t('accounting.title')}</h1>
      <p className="form-hint">{t('accounting.help')}</p>
      <div className="operation-card operation-actions">
        <label>{t('accounting.period')}{' '}
          <input className="form-input" type="month" aria-label={t('accounting.period')} value={mesValor} max={diaCalendarioEnZona().slice(0, 7)}
            onChange={e => { const [a, m] = e.target.value.split('-').map(Number); if (a && m) setPeriodo({ anio: a, mes: m }); }} />
        </label>
        {reporteDe[pestana] && (['csv', 'xlsx', 'pdf'] as const).map(f => (
          <button key={f} type="button" className="btn btn-secondary" onClick={() => void exportar(reporteDe[pestana]!, f)}>{t(`accounting.export_${f}`)}</button>
        ))}
      </div>
      <div role="tablist" aria-label={t('accounting.sections')} className="operation-actions">
        {PESTANAS.map(p => (
          <button key={p} type="button" role="tab" aria-selected={pestana === p} className={`btn ${pestana === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setPestana(p); setMensaje(''); }}>
            {t(`accounting.tab.${p}`)}
          </button>
        ))}
      </div>
      {(errorCarga || error) && <div className="operation-error" role="alert">{errorCarga || error}</div>}
      {mensaje && <div className="operation-success" role="status">{mensaje}</div>}
      {cargando && <p aria-busy="true">{t('accounting.loading')}</p>}
      {!cargando && !errorCarga && (
        <>
          {pestana === 'resumen' && datos.isv && <Resumen isv={datos.isv} conciliacion={datos.conciliacion} t={t} />}
          {(pestana === 'ventas' || pestana === 'compras') && datos.libro && <Libro libro={datos.libro} ventas={pestana === 'ventas'} t={t} />}
          {pestana === 'documentos' && datos.documentos && <Documentos documentos={datos.documentos} puedeRegistrar={puede('contabilidad.registrar')} enviando={enviando} enviar={enviar} t={t} />}
          {pestana === 'retenciones' && datos.retenciones && <Retenciones datos={datos} puedeRegistrar={puede('contabilidad.registrar')} enviando={enviando} enviar={enviar} t={t} />}
          {pestana === 'configuracion' && datos.configuracion && <Configuracion datos={datos.configuracion} puedeConfigurar={puede('contabilidad.configurar')} enviando={enviando} enviar={enviar} t={t} />}
          {pestana === 'periodos' && datos.periodos && <Periodos periodos={datos.periodos} puedeCerrar={puede('contabilidad.cerrar_periodo')} puedeReabrir={user?.rol === 'ADMIN'} enviando={enviando} enviar={enviar} t={t} />}
          {pestana === 'partida' && datos.cuentas && <Partida datos={datos} puedeRegistrar={puede('contabilidad.registrar')} enviando={enviando} enviar={enviar} t={t} />}
          {pestana === 'ajustes' && datos.ajustes && <Ajustes ajustes={datos.ajustes} t={t} />}
        </>
      )}
    </div>
  );
};

type T = (k: string, o?: any) => string;
type Enviar = (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;

const Hallazgos: React.FC<{ codigos: string[]; t: T }> = ({ codigos, t }) => codigos.length === 0
  ? <span className="balance-estado balance-estado-PAGADA">{t('accounting.ok')}</span>
  : <>{codigos.map(c => <span key={c} className="balance-estado balance-estado-VENCIDA" title={c}>{etiquetaHallazgo(c, t)}</span>)}</>;

const Resumen: React.FC<{ isv: Fila; conciliacion: Fila; t: T }> = ({ isv, conciliacion, t }) => (
  <>
    <section className="operation-card" aria-label={t('accounting.isv_summary')}>
      <h2>{t('accounting.isv_summary')}</h2>
      <div className="operation-table"><table><tbody>
        <tr><th>{t('accounting.debit')}</th><td>{L(isv.debitoFiscal)}</td></tr>
        <tr><th>{t('accounting.credit')}</th><td>{L(isv.creditoFiscal)}</td></tr>
        <tr><th>{t('accounting.withheld_from_us')}</th><td>{L(isv.retencionesIsvSufridas)}</td></tr>
        <tr><th>{t(`accounting.result.${isv.tipoResultado}`)}</th><td><strong>{L(isv.resultado)}</strong></td></tr>
        <tr><th>{t('accounting.to_remit')}</th><td>ISV {L(isv.retencionesPorEnterar?.isv)} · ISR {L(isv.retencionesPorEnterar?.isr)}</td></tr>
        <tr><th>{t('accounting.sales_without_doc')}</th><td>{isv.ventasSinDocumento?.cantidad} · {L(isv.ventasSinDocumento?.total)}</td></tr>
        <tr><th>{t('accounting.purchases_without_doc')}</th><td>{isv.comprasSinDocumento?.cantidad} · {L(isv.comprasSinDocumento?.total)}</td></tr>
      </tbody></table></div>
      <p className="form-hint">{t('accounting.isv_notice')}</p>
    </section>
    <section className="operation-card" aria-label={t('accounting.reconciliation')}>
      <h2>{t('accounting.reconciliation')} · {t(`accounting.period_state.${conciliacion.estadoPeriodo}`)}</h2>
      {conciliacion.total === 0 ? <p>{t('accounting.no_findings')}</p> : (
        <div className="operation-table"><table>
          <thead><tr><th>{t('accounting.book')}</th><th>{t('accounting.finding_col')}</th><th>{t('accounting.reference')}</th><th>{t('accounting.detail')}</th></tr></thead>
          <tbody>{conciliacion.hallazgos.map((h: Fila, i: number) => (
            <tr key={i}><td>{h.libro}</td><td>{etiquetaHallazgo(h.codigo, t)}</td><td>{h.referencia}</td><td>{h.detalle ?? '—'}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  </>
);

const Libro: React.FC<{ libro: Fila; ventas: boolean; t: T }> = ({ libro, ventas, t }) => (
  <section className="operation-card" aria-label={t(ventas ? 'accounting.tab.ventas' : 'accounting.tab.compras')}>
    <h2>{t(ventas ? 'accounting.tab.ventas' : 'accounting.tab.compras')} · {libro.periodo.desde} — {libro.periodo.hasta}</h2>
    {libro.filas.length === 0 ? <p>{t('accounting.empty')}</p> : (
      <div className="operation-table"><table>
        <thead><tr>
          <th>{t('accounting.date')}</th><th>{t('accounting.document')}</th><th>{t('accounting.counterparty')}</th><th>RTN</th>
          <th>{t('accounting.taxed')}</th><th>{t('accounting.exempt')}</th><th>ISV</th><th>{t('accounting.total')}</th><th>{t('accounting.state')}</th><th>{t('accounting.findings')}</th>
        </tr></thead>
        <tbody>{libro.filas.map((f: Fila) => (
          <tr key={`${f.documentoId ?? ''}${f.operacionId ?? ''}`}>
            <td>{f.fecha}</td>
            <td>{f.numero ? `${f.tipoDocumentoNombre ?? ''} ${f.numero}` : t('accounting.no_document')}{f.referenciaInterna ? <><br /><small>{f.referenciaInterna}</small></> : null}</td>
            <td>{f.contraparte}</td><td>{f.rtn ?? '—'}</td>
            <td>{L(Number(f.importeGravadoGeneral) + Number(f.importeGravadoEspecial))}</td>
            <td>{L(Number(f.importeExento) + Number(f.importeExonerado))}</td>
            <td>{L(Number(f.isvGeneral) + Number(f.isvEspecial))}</td>
            <td>{f.signo < 0 ? '−' : ''}{L(f.total)}</td><td>{f.estado}</td>
            <td><Hallazgos codigos={f.hallazgos} t={t} /></td>
          </tr>
        ))}</tbody>
      </table></div>
    )}
    <p><strong>{t('accounting.totals')}:</strong> {t('accounting.documents_count', { count: libro.totales.documentos })} · {t('accounting.taxed')} {L(libro.totales.importeGravadoGeneral)} · ISV {L(Number(libro.totales.isvGeneral) + Number(libro.totales.isvEspecial))} · {t('accounting.total')} {L(libro.totales.total)}</p>
    <p className="form-hint">{t('accounting.without_doc_note', { count: libro.totales.sinDocumento.cantidad })} {L(libro.totales.sinDocumento.total)}</p>
    {ventas && libro.devoluciones?.length > 0 && (
      <>
        <h3>{t('accounting.returns')}</h3>
        <ul>{libro.devoluciones.map((d: Fila) => <li key={d.id}>{d.fecha} · {d.referenciaInterna} · {L(d.monto)} <Hallazgos codigos={d.hallazgos} t={t} /></li>)}</ul>
      </>
    )}
  </section>
);

const Documentos: React.FC<{ documentos: Fila[]; puedeRegistrar: boolean; enviando: boolean; enviar: Enviar; t: T }> = ({ documentos, puedeRegistrar, enviando, enviar, t }) => {
  const vacio = { direccion: 'EMITIDO', tipoDocumento: '01', numero: '', fechaEmision: diaCalendarioEnZona(), cai: '', rtnContraparte: '', nombreContraparte: '', ventaId: '', ordenCompraId: '', documentoReferenciaId: '', ...Object.fromEntries(IMPORTES.map(k => [k, ''])) } as Record<string, string>;
  const [f, setF] = useState(vacio);
  const [accion, setAccion] = useState({ id: '', motivo: '' });
  const numeroOk = numeroFiscalValido(f.numero, f.tipoDocumento);
  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    const importes = Object.fromEntries(IMPORTES.map(k => [k, importeOpcional(f[k])]).filter(([, v]) => v !== undefined));
    const cuerpo: Record<string, unknown> = { direccion: f.direccion, tipoDocumento: f.tipoDocumento, numero: f.numero.trim(), fechaEmision: f.fechaEmision, ...importes };
    for (const k of ['cai', 'rtnContraparte', 'nombreContraparte', 'ventaId', 'ordenCompraId', 'documentoReferenciaId']) if (f[k].trim()) cuerpo[k] = f[k].trim();
    if (await enviar(() => api.post('/contabilidad/documentos', cuerpo), t('accounting.document_saved'))) setF(vacio);
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      {puedeRegistrar && (
        <form className="operation-card operation-form" onSubmit={registrar} aria-label={t('accounting.register_document')}>
          <h2 style={{ width: '100%' }}>{t('accounting.register_document')}</h2>
          <label>{t('accounting.direction')}<select className="form-input" value={f.direccion} onChange={set('direccion')}><option value="EMITIDO">{t('accounting.issued')}</option><option value="RECIBIDO">{t('accounting.received')}</option></select></label>
          <label>{t('accounting.doc_type')}<select className="form-input" value={f.tipoDocumento} onChange={set('tipoDocumento')}>{TIPOS.map(x => <option key={x} value={x}>{x} · {t(`accounting.doc_types.${x}`)}</option>)}</select></label>
          <label>{t('accounting.number')}<input className="form-input" required placeholder="000-001-01-00000001" value={f.numero} onChange={set('numero')} aria-invalid={!!f.numero && !numeroOk} /></label>
          <label>{t('accounting.date')}<input className="form-input" type="date" required value={f.fechaEmision} onChange={set('fechaEmision')} /></label>
          {f.direccion === 'RECIBIDO' && <label>CAI<input className="form-input" maxLength={60} value={f.cai} onChange={set('cai')} /></label>}
          <label>RTN<input className="form-input" maxLength={20} value={f.rtnContraparte} onChange={set('rtnContraparte')} /></label>
          <label>{t('accounting.counterparty')}<input className="form-input" maxLength={200} value={f.nombreContraparte} onChange={set('nombreContraparte')} /></label>
          {f.direccion === 'EMITIDO'
            ? <label>{t('accounting.sale_id')}<input className="form-input" value={f.ventaId} onChange={set('ventaId')} /></label>
            : <label>{t('accounting.purchase_id')}<input className="form-input" value={f.ordenCompraId} onChange={set('ordenCompraId')} /></label>}
          {(f.tipoDocumento === '06' || f.tipoDocumento === '07') && <label>{t('accounting.reference_doc')}<select className="form-input" value={f.documentoReferenciaId} onChange={set('documentoReferenciaId')}><option value="">—</option>{documentos.filter(d => d.estado === 'VIGENTE' && d.direccion === f.direccion && d.tipoDocumento === '01').map(d => <option key={d.id} value={d.id}>{d.numero}</option>)}</select></label>}
          {IMPORTES.map(k => <label key={k}>{t(`accounting.amount.${k}`)}<input className="form-input" type="number" min="0" step="0.01" value={f[k]} onChange={set(k)} /></label>)}
          <p className="form-hint" style={{ width: '100%' }}>{t('accounting.amounts_hint')}</p>
          <button type="submit" className="btn btn-primary" disabled={enviando || !numeroOk}>{t('accounting.save')}</button>
        </form>
      )}
      <section className="operation-card">
        <h2>{t('accounting.tab.documentos')}</h2>
        {documentos.length === 0 ? <p>{t('accounting.empty')}</p> : (
          <div className="operation-table"><table>
            <thead><tr><th>{t('accounting.date')}</th><th>{t('accounting.direction')}</th><th>{t('accounting.number')}</th><th>{t('accounting.counterparty')}</th><th>{t('accounting.total')}</th><th>{t('accounting.state')}</th></tr></thead>
            <tbody>{documentos.map(d => <tr key={d.id}><td>{d.fechaEmision}</td><td>{d.direccion}</td><td>{d.numero}</td><td>{d.nombreContraparte}</td><td>{L(d.total)}</td><td>{d.estado}{d.motivoAnulacion ? ` · ${d.motivoAnulacion}` : ''}</td></tr>)}</tbody>
          </table></div>
        )}
        {puedeRegistrar && documentos.some(d => d.estado === 'VIGENTE') && (
          <form className="operation-form" aria-label={t('accounting.void_document')} onSubmit={async e => { e.preventDefault(); if (await enviar(() => api.post(`/contabilidad/documentos/${accion.id}/anular`, { motivo: accion.motivo.trim() }), t('accounting.document_voided'))) setAccion({ id: '', motivo: '' }); }}>
            <label>{t('accounting.void_document')}<select className="form-input" required value={accion.id} onChange={e => setAccion({ ...accion, id: e.target.value })}><option value="">—</option>{documentos.filter(d => d.estado === 'VIGENTE').map(d => <option key={d.id} value={d.id}>{d.numero}</option>)}</select></label>
            <label>{t('accounting.reason')}<input className="form-input" required minLength={3} maxLength={500} value={accion.motivo} onChange={e => setAccion({ ...accion, motivo: e.target.value })} /></label>
            <button type="submit" className="btn btn-secondary" disabled={enviando || !accion.id || accion.motivo.trim().length < 3}>{t('accounting.void')}</button>
          </form>
        )}
      </section>
    </>
  );
};

const Retenciones: React.FC<{ datos: Fila; puedeRegistrar: boolean; enviando: boolean; enviar: Enviar; t: T }> = ({ datos, puedeRegistrar, enviando, enviar, t }) => {
  const [f, setF] = useState({ documentoId: '', reglaId: '', tipo: 'SUFRIDA', fecha: diaCalendarioEnZona(), comprobanteNumero: '' });
  const reglas: Fila[] = datos.configuracion?.reglas ?? [];
  const docs = (datos.documentos as Fila[]).filter(d => d.estado === 'VIGENTE' && d.direccion === (f.tipo === 'SUFRIDA' ? 'EMITIDO' : 'RECIBIDO'));
  return (
    <>
      {puedeRegistrar && (
        <form className="operation-card operation-form" aria-label={t('accounting.register_withholding')} onSubmit={async e => {
          e.preventDefault();
          await enviar(() => api.post(`/contabilidad/documentos/${f.documentoId}/retenciones`, { reglaId: f.reglaId, tipo: f.tipo, fecha: f.fecha, ...(f.comprobanteNumero.trim() ? { comprobanteNumero: f.comprobanteNumero.trim() } : {}) }), t('accounting.withholding_saved'));
        }}>
          <h2 style={{ width: '100%' }}>{t('accounting.register_withholding')}</h2>
          <label>{t('accounting.withholding_type')}<select className="form-input" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value, documentoId: '' })}><option value="SUFRIDA">{t('accounting.suffered')}</option><option value="EFECTUADA">{t('accounting.made')}</option></select></label>
          <label>{t('accounting.document')}<select className="form-input" required value={f.documentoId} onChange={e => setF({ ...f, documentoId: e.target.value })}><option value="">—</option>{docs.map(d => <option key={d.id} value={d.id}>{d.numero} · {d.nombreContraparte}</option>)}</select></label>
          <label>{t('accounting.rule')}<select className="form-input" required value={f.reglaId} onChange={e => setF({ ...f, reglaId: e.target.value })}><option value="">—</option>{reglas.map(r => <option key={r.id} value={r.id}>{r.codigo} · {r.impuesto} {r.porcentaje}%</option>)}</select></label>
          <label>{t('accounting.date')}<input className="form-input" type="date" required value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label>
          <label>{t('accounting.voucher')}<input className="form-input" placeholder="000-001-05-00000001" value={f.comprobanteNumero} onChange={e => setF({ ...f, comprobanteNumero: e.target.value })} /></label>
          {reglas.length === 0 && <p className="form-hint" style={{ width: '100%' }}>{t('accounting.no_rules')}</p>}
          <button type="submit" className="btn btn-primary" disabled={enviando || !f.documentoId || !f.reglaId}>{t('accounting.save')}</button>
        </form>
      )}
      <section className="operation-card">
        <h2>{t('accounting.tab.retenciones')}</h2>
        {datos.retenciones.length === 0 ? <p>{t('accounting.empty')}</p> : (
          <div className="operation-table"><table>
            <thead><tr><th>{t('accounting.date')}</th><th>{t('accounting.withholding_type')}</th><th>{t('accounting.rule')}</th><th>{t('accounting.document')}</th><th>{t('accounting.base')}</th><th>{t('accounting.amount_col')}</th><th>{t('accounting.state')}</th></tr></thead>
            <tbody>{datos.retenciones.map((r: Fila) => <tr key={r.id}><td>{r.fecha}</td><td>{r.tipo}</td><td>{r.regla.codigo} ({r.porcentaje}%)</td><td>{r.documentoNumero}</td><td>{L(r.base)}</td><td>{L(r.monto)}</td><td>{r.estado}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
};

const Configuracion: React.FC<{ datos: Fila; puedeConfigurar: boolean; enviando: boolean; enviar: Enviar; t: T }> = ({ datos, puedeConfigurar, enviando, enviar, t }) => {
  const c = datos.configuracion ?? {};
  const [cfg, setCfg] = useState({ rtn: c.rtn ?? '', razonSocial: c.razonSocial ?? '', nombreComercial: c.nombreComercial ?? '', agenteRetencion: !!c.agenteRetencion, motivo: '' });
  const [tasa, setTasa] = useState({ categoria: 'GENERAL', porcentaje: '', vigenteDesde: '', vigenteHasta: '', baseLegal: '' });
  const [regla, setRegla] = useState({ codigo: '', impuesto: 'ISV', descripcion: '', porcentaje: '', baseCalculo: 'IMPUESTO', vigenteDesde: '', baseLegal: '' });
  const [cai, setCai] = useState({ cai: '', tipoDocumento: '01', establecimiento: '000', puntoEmision: '001', rangoInicial: '', rangoFinal: '', fechaLimiteEmision: '' });
  return (
    <>
      <section className="operation-card">
        <h2>{t('accounting.fiscal_settings')}</h2>
        <p className="form-hint">{t('accounting.no_preloaded_rules')}</p>
        {puedeConfigurar ? (
          <form className="operation-form" aria-label={t('accounting.fiscal_settings')} onSubmit={async e => { e.preventDefault(); await enviar(() => api.put('/contabilidad/configuracion', { ...cfg, rtn: cfg.rtn.trim() || null }), t('accounting.saved')); }}>
            <label>RTN<input className="form-input" maxLength={20} value={cfg.rtn} onChange={e => setCfg({ ...cfg, rtn: e.target.value })} /></label>
            <label>{t('accounting.legal_name')}<input className="form-input" required maxLength={200} value={cfg.razonSocial} onChange={e => setCfg({ ...cfg, razonSocial: e.target.value })} /></label>
            <label>{t('accounting.trade_name')}<input className="form-input" maxLength={200} value={cfg.nombreComercial} onChange={e => setCfg({ ...cfg, nombreComercial: e.target.value })} /></label>
            <label><span><input type="checkbox" checked={cfg.agenteRetencion} onChange={e => setCfg({ ...cfg, agenteRetencion: e.target.checked })} /> {t('accounting.withholding_agent')}</span></label>
            <label>{t('accounting.reason')}<input className="form-input" required minLength={3} maxLength={500} value={cfg.motivo} onChange={e => setCfg({ ...cfg, motivo: e.target.value })} /></label>
            <button type="submit" className="btn btn-primary" disabled={enviando}>{t('accounting.save')}</button>
          </form>
        ) : <p>RTN {c.rtn ?? '—'} · {c.razonSocial ?? '—'}</p>}
      </section>
      <section className="operation-card">
        <h2>{t('accounting.rates')}</h2>
        <Tabla filas={datos.tasas} columnas={['categoria', 'porcentaje', 'vigenteDesde', 'vigenteHasta', 'baseLegal']} t={t} />
        {puedeConfigurar && (
          <form className="operation-form" aria-label={t('accounting.new_rate')} onSubmit={async e => { e.preventDefault(); await enviar(() => api.post('/contabilidad/tasas', { ...tasa, porcentaje: Number(tasa.porcentaje), vigenteHasta: tasa.vigenteHasta || undefined }), t('accounting.saved')); }}>
            <label>{t('accounting.col.categoria')}<select className="form-input" value={tasa.categoria} onChange={e => setTasa({ ...tasa, categoria: e.target.value })}><option value="GENERAL">GENERAL</option><option value="ESPECIAL">ESPECIAL</option></select></label>
            <label>%<input className="form-input" type="number" required min="0.01" max="99.99" step="0.01" value={tasa.porcentaje} onChange={e => setTasa({ ...tasa, porcentaje: e.target.value })} /></label>
            <label>{t('accounting.col.vigenteDesde')}<input className="form-input" type="date" required value={tasa.vigenteDesde} onChange={e => setTasa({ ...tasa, vigenteDesde: e.target.value })} /></label>
            <label>{t('accounting.col.vigenteHasta')}<input className="form-input" type="date" value={tasa.vigenteHasta} onChange={e => setTasa({ ...tasa, vigenteHasta: e.target.value })} /></label>
            <label>{t('accounting.col.baseLegal')}<input className="form-input" required minLength={3} maxLength={500} value={tasa.baseLegal} onChange={e => setTasa({ ...tasa, baseLegal: e.target.value })} /></label>
            <button type="submit" className="btn btn-primary" disabled={enviando}>{t('accounting.add')}</button>
          </form>
        )}
      </section>
      <section className="operation-card">
        <h2>{t('accounting.withholding_rules')}</h2>
        <Tabla filas={datos.reglas} columnas={['codigo', 'impuesto', 'descripcion', 'porcentaje', 'baseCalculo', 'vigenteDesde', 'vigenteHasta', 'baseLegal']} t={t} />
        {puedeConfigurar && (
          <form className="operation-form" aria-label={t('accounting.new_rule')} onSubmit={async e => { e.preventDefault(); await enviar(() => api.post('/contabilidad/reglas-retencion', { ...regla, codigo: regla.codigo.trim().toUpperCase(), porcentaje: Number(regla.porcentaje) }), t('accounting.saved')); }}>
            <label>{t('accounting.col.codigo')}<input className="form-input" required pattern="[A-Za-z0-9_\-]{2,30}" value={regla.codigo} onChange={e => setRegla({ ...regla, codigo: e.target.value })} /></label>
            <label>{t('accounting.col.impuesto')}<select className="form-input" value={regla.impuesto} onChange={e => setRegla({ ...regla, impuesto: e.target.value })}><option>ISV</option><option>ISR</option></select></label>
            <label>{t('accounting.col.descripcion')}<input className="form-input" required minLength={3} value={regla.descripcion} onChange={e => setRegla({ ...regla, descripcion: e.target.value })} /></label>
            <label>%<input className="form-input" type="number" required min="0.01" max="100" step="0.01" value={regla.porcentaje} onChange={e => setRegla({ ...regla, porcentaje: e.target.value })} /></label>
            <label>{t('accounting.col.baseCalculo')}<select className="form-input" value={regla.baseCalculo} onChange={e => setRegla({ ...regla, baseCalculo: e.target.value })}><option value="IMPUESTO">{t('accounting.base_tax')}</option><option value="BASE_GRAVABLE">{t('accounting.base_taxable')}</option><option value="TOTAL">{t('accounting.base_total')}</option></select></label>
            <label>{t('accounting.col.vigenteDesde')}<input className="form-input" type="date" required value={regla.vigenteDesde} onChange={e => setRegla({ ...regla, vigenteDesde: e.target.value })} /></label>
            <label>{t('accounting.col.baseLegal')}<input className="form-input" required minLength={3} value={regla.baseLegal} onChange={e => setRegla({ ...regla, baseLegal: e.target.value })} /></label>
            <button type="submit" className="btn btn-primary" disabled={enviando}>{t('accounting.add')}</button>
          </form>
        )}
      </section>
      <section className="operation-card">
        <h2>CAI</h2>
        <Tabla filas={datos.cai} columnas={['cai', 'tipoDocumento', 'establecimiento', 'puntoEmision', 'rangoInicial', 'rangoFinal', 'fechaLimiteEmision', 'ultimoUsado', 'disponibles', 'activo']} t={t} />
        {puedeConfigurar && (
          <form className="operation-form" aria-label={t('accounting.new_cai')} onSubmit={async e => { e.preventDefault(); await enviar(() => api.post('/contabilidad/cai', { ...cai, rangoInicial: Number(cai.rangoInicial), rangoFinal: Number(cai.rangoFinal) }), t('accounting.saved')); }}>
            <label>CAI<input className="form-input" required minLength={6} maxLength={60} value={cai.cai} onChange={e => setCai({ ...cai, cai: e.target.value })} /></label>
            <label>{t('accounting.doc_type')}<select className="form-input" value={cai.tipoDocumento} onChange={e => setCai({ ...cai, tipoDocumento: e.target.value })}>{TIPOS.map(x => <option key={x} value={x}>{x} · {t(`accounting.doc_types.${x}`)}</option>)}</select></label>
            <label>{t('accounting.col.establecimiento')}<input className="form-input" required pattern="\d{3}" value={cai.establecimiento} onChange={e => setCai({ ...cai, establecimiento: e.target.value })} /></label>
            <label>{t('accounting.col.puntoEmision')}<input className="form-input" required pattern="\d{3}" value={cai.puntoEmision} onChange={e => setCai({ ...cai, puntoEmision: e.target.value })} /></label>
            <label>{t('accounting.col.rangoInicial')}<input className="form-input" type="number" required min="1" max="99999999" value={cai.rangoInicial} onChange={e => setCai({ ...cai, rangoInicial: e.target.value })} /></label>
            <label>{t('accounting.col.rangoFinal')}<input className="form-input" type="number" required min="1" max="99999999" value={cai.rangoFinal} onChange={e => setCai({ ...cai, rangoFinal: e.target.value })} /></label>
            <label>{t('accounting.col.fechaLimiteEmision')}<input className="form-input" type="date" required value={cai.fechaLimiteEmision} onChange={e => setCai({ ...cai, fechaLimiteEmision: e.target.value })} /></label>
            <button type="submit" className="btn btn-primary" disabled={enviando}>{t('accounting.add')}</button>
          </form>
        )}
      </section>
    </>
  );
};

const Tabla: React.FC<{ filas: Fila[]; columnas: string[]; t: T }> = ({ filas, columnas, t }) => filas.length === 0 ? <p>{t('accounting.empty')}</p> : (
  <div className="operation-table"><table>
    <thead><tr>{columnas.map(c => <th key={c}>{t(`accounting.col.${c}`)}</th>)}</tr></thead>
    <tbody>{filas.map((f, i) => <tr key={f.id ?? i}>{columnas.map(c => <td key={c}>{typeof f[c] === 'boolean' ? (f[c] ? '✓' : '—') : f[c] ?? '—'}</td>)}</tr>)}</tbody>
  </table></div>
);

const Periodos: React.FC<{ periodos: Fila[]; puedeCerrar: boolean; puedeReabrir: boolean; enviando: boolean; enviar: Enviar; t: T }> = ({ periodos, puedeCerrar, puedeReabrir, enviando, enviar, t }) => {
  const [motivo, setMotivo] = useState('');
  const hoy = diaCalendarioEnZona();
  return (
    <section className="operation-card">
      <h2>{t('accounting.tab.periodos')}</h2>
      <label>{t('accounting.reason')}<input className="form-input" maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
      <div className="operation-table"><table>
        <thead><tr><th>{t('accounting.period')}</th><th>{t('accounting.state')}</th><th>{t('accounting.closed_by')}</th><th /></tr></thead>
        <tbody>{periodos.map(p => {
          const etiqueta = `${p.anio}-${String(p.mes).padStart(2, '0')}`;
          const terminado = etiqueta < hoy.slice(0, 7);
          return (
            <tr key={etiqueta}>
              <td>{etiqueta}</td><td>{t(`accounting.period_state.${p.estado}`)}</td><td>{p.cerradoPor ?? '—'}</td>
              <td>
                {p.estado === 'ABIERTO' && puedeCerrar && terminado && <button type="button" className="btn btn-secondary" disabled={enviando || motivo.trim().length < 3} onClick={() => void enviar(() => api.post(`/contabilidad/periodos/${p.anio}/${p.mes}/cerrar`, { motivo: motivo.trim() }), t('accounting.period_closed'))}>{t('accounting.close')}</button>}
                {p.estado === 'CERRADO' && puedeReabrir && <button type="button" className="btn btn-secondary" disabled={enviando || motivo.trim().length < 3} onClick={() => void enviar(() => api.post(`/contabilidad/periodos/${p.anio}/${p.mes}/reabrir`, { motivo: motivo.trim() }), t('accounting.period_reopened'))}>{t('accounting.reopen')}</button>}
              </td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <p className="form-hint">{t('accounting.period_hint')}</p>
    </section>
  );
};

const Partida: React.FC<{ datos: Fila; puedeRegistrar: boolean; enviando: boolean; enviar: Enviar; t: T }> = ({ datos, puedeRegistrar, enviando, enviar, t }) => {
  const cuentas: Fila[] = datos.cuentas;
  const [cuenta, setCuenta] = useState({ codigo: '', nombre: '', tipo: 'ACTIVO', naturaleza: 'DEUDORA', padreId: '' });
  const [asiento, setAsiento] = useState({ fecha: diaCalendarioEnZona(), concepto: '', lineas: [{ cuentaId: '', debe: '', haber: '' }, { cuentaId: '', debe: '', haber: '' }] });
  const preparado = useMemo(() => prepararAsiento(asiento.lineas), [asiento.lineas]);
  const movibles = cuentas.filter(k => k.activa && k.aceptaMovimientos);
  const setLinea = (i: number, k: string, v: string) => setAsiento({ ...asiento, lineas: asiento.lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)) });
  return (
    <>
      <section className="operation-card">
        <h2>{t('accounting.chart_of_accounts')}</h2>
        <Tabla filas={cuentas} columnas={['codigo', 'nombre', 'tipo', 'naturaleza', 'aceptaMovimientos']} t={t} />
        {puedeRegistrar && (
          <form className="operation-form" aria-label={t('accounting.new_account')} onSubmit={async e => { e.preventDefault(); await enviar(() => api.post('/contabilidad/cuentas', { ...cuenta, padreId: cuenta.padreId || undefined }), t('accounting.saved')); }}>
            <label>{t('accounting.col.codigo')}<input className="form-input" required pattern="[0-9]+(\.[0-9]+)*" value={cuenta.codigo} onChange={e => setCuenta({ ...cuenta, codigo: e.target.value })} /></label>
            <label>{t('accounting.col.nombre')}<input className="form-input" required minLength={2} value={cuenta.nombre} onChange={e => setCuenta({ ...cuenta, nombre: e.target.value })} /></label>
            <label>{t('accounting.col.tipo')}<select className="form-input" value={cuenta.tipo} onChange={e => setCuenta({ ...cuenta, tipo: e.target.value })}>{['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'COSTO', 'GASTO'].map(x => <option key={x}>{x}</option>)}</select></label>
            <label>{t('accounting.col.naturaleza')}<select className="form-input" value={cuenta.naturaleza} onChange={e => setCuenta({ ...cuenta, naturaleza: e.target.value })}><option>DEUDORA</option><option>ACREEDORA</option></select></label>
            <label>{t('accounting.parent')}<select className="form-input" value={cuenta.padreId} onChange={e => setCuenta({ ...cuenta, padreId: e.target.value })}><option value="">—</option>{cuentas.map(k => <option key={k.id} value={k.id}>{k.codigo} {k.nombre}</option>)}</select></label>
            <button type="submit" className="btn btn-primary" disabled={enviando}>{t('accounting.add')}</button>
          </form>
        )}
      </section>
      {puedeRegistrar && (
        <form className="operation-card operation-form" aria-label={t('accounting.new_entry')} onSubmit={async e => { e.preventDefault(); await enviar(() => api.post('/contabilidad/asientos', { fecha: asiento.fecha, concepto: asiento.concepto.trim(), lineas: preparado.lineas }), t('accounting.entry_saved')); }}>
          <h2 style={{ width: '100%' }}>{t('accounting.new_entry')}</h2>
          <label>{t('accounting.date')}<input className="form-input" type="date" required value={asiento.fecha} onChange={e => setAsiento({ ...asiento, fecha: e.target.value })} /></label>
          <label>{t('accounting.concept')}<input className="form-input" required minLength={3} maxLength={300} value={asiento.concepto} onChange={e => setAsiento({ ...asiento, concepto: e.target.value })} /></label>
          {asiento.lineas.map((l, i) => (
            <fieldset key={i} className="operation-form" style={{ width: '100%' }}>
              <label>{t('accounting.account')}<select className="form-input" value={l.cuentaId} onChange={e => setLinea(i, 'cuentaId', e.target.value)}><option value="">—</option>{movibles.map(k => <option key={k.id} value={k.id}>{k.codigo} {k.nombre}</option>)}</select></label>
              <label>{t('accounting.debit_col')}<input className="form-input" type="number" min="0" step="0.01" value={l.debe} onChange={e => setLinea(i, 'debe', e.target.value)} /></label>
              <label>{t('accounting.credit_col')}<input className="form-input" type="number" min="0" step="0.01" value={l.haber} onChange={e => setLinea(i, 'haber', e.target.value)} /></label>
            </fieldset>
          ))}
          <button type="button" className="btn btn-secondary" onClick={() => setAsiento({ ...asiento, lineas: [...asiento.lineas, { cuentaId: '', debe: '', haber: '' }] })}>{t('accounting.add_line')}</button>
          <p aria-live="polite">{t('accounting.debit_col')} {L(preparado.debe)} · {t('accounting.credit_col')} {L(preparado.haber)} · {preparado.cuadra ? t('accounting.balanced') : t('accounting.unbalanced')}</p>
          <button type="submit" className="btn btn-primary" disabled={enviando || !preparado.cuadra}>{t('accounting.save')}</button>
        </form>
      )}
      <section className="operation-card">
        <h2>{t('accounting.journal')}</h2>
        {datos.asientos.length === 0 ? <p>{t('accounting.empty')}</p> : datos.asientos.map((a: Fila) => (
          <div key={a.id} className="operation-table">
            <p><strong>#{a.numero}</strong> · {a.fecha} · {a.concepto} · {a.estado}</p>
            <table><tbody>{a.lineas.map((l: Fila, i: number) => <tr key={i}><td>{l.codigo} {l.nombre}</td><td>{Number(l.debe) > 0 ? L(l.debe) : ''}</td><td>{Number(l.haber) > 0 ? L(l.haber) : ''}</td></tr>)}</tbody></table>
          </div>
        ))}
      </section>
      <section className="operation-card">
        <h2>{t('accounting.trial_balance')} · {datos.balanza.totales.cuadra ? t('accounting.balanced') : t('accounting.unbalanced')}</h2>
        <Tabla filas={datos.balanza.cuentas} columnas={['codigo', 'nombre', 'debePeriodo', 'haberPeriodo', 'saldo']} t={t} />
      </section>
    </>
  );
};

const Ajustes: React.FC<{ ajustes: Fila[]; t: T }> = ({ ajustes, t }) => (
  <section className="operation-card">
    <h2>{t('accounting.tab.ajustes')}</h2>
    {ajustes.length === 0 ? <p>{t('accounting.empty')}</p> : (
      <div className="operation-table"><table>
        <thead><tr><th>{t('accounting.date')}</th><th>{t('accounting.entity')}</th><th>{t('accounting.action')}</th><th>{t('accounting.reason')}</th><th>{t('accounting.user')}</th></tr></thead>
        <tbody>{ajustes.map(a => <tr key={a.id}><td>{String(a.fecha).slice(0, 19).replace('T', ' ')}</td><td>{a.entidad}</td><td>{a.accion}</td><td>{a.motivo}</td><td>{a.usuario}</td></tr>)}</tbody>
      </table></div>
    )}
  </section>
);
