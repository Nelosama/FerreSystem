import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { ZONA_HORARIA_NEGOCIO, formatLempiras } from '../utils/format';
import './OperacionesPage.css';
import './ArqueoCajaPage.css';

type Resumen = { fondoInicial: number; ingresosEfectivo: number; egresosEfectivo: number; efectivoEsperado: number; totalesPorMetodo: Record<string, number>; efectivoContado?: number; diferencia?: number };
type Movimiento = { id: string; tipo: string; monto: string | number; metodo: string; concepto: string; referencia?: string | null; created_at: string };
type Caja = {
  id: string; estado: 'ABIERTA' | 'CERRADA'; usuario_id: string; usuario_nombre?: string | null; fecha_apertura: string; fecha_cierre?: string | null;
  monto_apertura: string | number; monto_cierre_fisico?: string | number | null; monto_esperado?: string | number | null; diferencia?: string | number | null; notas?: string | null;
  movimientos?: Movimiento[]; resumen?: Resumen; efectivo_neto?: string | number;
};
type Command = { path: string; body: any };
const METHODS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CREDITO'] as const;
const money = (value: unknown) => formatLempiras(Number(value || 0));
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const newRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const ArqueoCajaPage: React.FC = () => {
  const { tenant, user, isReadOnly } = useTenant();
  const { t, locale } = useI18n();
  const pendingKey = `ferre_caja_pendiente:${tenant.id}:${user?.id}`;
  const canRecordManual = user?.rol === 'ADMIN' || !!user?.permisos?.includes('caja.movimientos_manuales');
  const isAdmin = user?.rol === 'ADMIN';
  const dateLocale = locale === 'en' ? 'en-US' : 'es-HN';
  const fecha = (value?: string | null) => value ? new Date(value).toLocaleString(dateLocale, { timeZone: ZONA_HORARIA_NEGOCIO }) : '—';
  const errorMessage = useCallback((e: any) => {
    const message = e.response?.data?.message;
    return Array.isArray(message) ? message.join(', ') : message || t('cash_drawer.error_fallback');
  }, [t]);

  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cierres, setCierres] = useState<any[]>([]);
  const [detalle, setDetalle] = useState<Caja | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [pending, setPending] = useState<Command | null>(null);
  const [fund, setFund] = useState('');
  const [movement, setMovement] = useState({ tipo: 'INGRESO_MANUAL', monto: '', concepto: '', referencia: '' });
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');

  const abierta = cajas.find(c => c.estado === 'ABIERTA') ?? null;
  const resumen = abierta?.resumen;
  const diferencia = useMemo(() => {
    if (!resumen || counted.trim() === '' || Number.isNaN(Number(counted))) return null;
    return roundMoney(Number(counted) - resumen.efectivoEsperado);
  }, [counted, resumen]);
  const blocked = busy || !!pending || isReadOnly;

  useEffect(() => {
    try { setPending(JSON.parse(localStorage.getItem(pendingKey) || 'null')); } catch { setPending(null); }
  }, [pendingKey]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const requests: Promise<any>[] = [api.get('/operaciones/caja')];
      if (isAdmin) requests.push(api.get('/operaciones/caja/cierres'));
      const [mine, all] = await Promise.all(requests);
      setCajas(mine.data);
      if (all) setCierres(all.data);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [errorMessage, isAdmin, tenant.id, user?.id]);
  useEffect(() => { void load(); }, [load]);

  const send = async (command: Command) => {
    if (running.current || isReadOnly) return false;
    running.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      localStorage.setItem(pendingKey, JSON.stringify(command)); setPending(command);
      const response = await api.post(command.path, command.body);
      localStorage.removeItem(pendingKey); setPending(null);
      return response.data;
    } catch (e: any) {
      // Respuestas de negocio definitivas liberan la solicitud; un fallo de red la conserva para reintentar.
      if ([400, 403, 404, 409, 422].includes(e.response?.status)) { localStorage.removeItem(pendingKey); setPending(null); }
      setError(errorMessage(e));
      return false;
    } finally { setBusy(false); running.current = false; }
  };
  // Con una operación pendiente se reenvía la misma, con su solicitud, para no duplicar el movimiento.
  const run = (path: string, body: any) => pending ? send(pending) : send({ path, body: { ...body, solicitudId: newRequestId() } });
  const afterChange = async (message: string) => { setSuccess(message); await load(); };
  const retryPending = async () => {
    if (!pending) return;
    const result = await send(pending);
    if (!result) return;
    if (pending.path.endsWith('/abrir')) { setFund(''); await afterChange(t('cash_drawer.saved_open')); }
    else if (pending.path.endsWith('/movimientos')) { setMovement({ tipo: 'INGRESO_MANUAL', monto: '', concepto: '', referencia: '' }); await afterChange(t('cash_drawer.saved_movement')); }
    else if (pending.path.endsWith('/cerrar')) { setCounted(''); setNotes(''); setDetalle(result); await afterChange(t('cash_drawer.saved_close')); }
  };

  const openDrawer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await run('/operaciones/caja/abrir', { monto: Number(fund) })) { setFund(''); await afterChange(t('cash_drawer.saved_open')); }
  };
  const registerMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!abierta) return;
    const body = { tipo: movement.tipo, monto: Number(movement.monto), concepto: movement.concepto.trim(), referencia: movement.referencia.trim() || undefined };
    if (await run(`/operaciones/caja/${abierta.id}/movimientos`, body)) {
      setMovement({ tipo: 'INGRESO_MANUAL', monto: '', concepto: '', referencia: '' });
      await afterChange(t('cash_drawer.saved_movement'));
    }
  };
  const closeDrawer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!abierta || !window.confirm(t('cash_drawer.confirm_close'))) return;
    const closed = await run(`/operaciones/caja/${abierta.id}/cerrar`, { monto: Number(counted), notas: notes.trim() || undefined });
    if (closed) {
      setCounted(''); setNotes('');
      setDetalle(null);
      await afterChange(t('cash_drawer.saved_close'));
      setDetalle(await api.get(`/operaciones/caja/${closed.id}`).then(r => r.data).catch(() => null));
    }
  };
  const verCaja = async (id: string) => {
    try { setDetalle((await api.get(`/operaciones/caja/${id}`)).data); } catch (e) { setError(errorMessage(e)); }
  };

  const differenceLabel = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    if (value === 0) return t('cash_drawer.balanced');
    return value > 0 ? `${t('cash_drawer.surplus')} ${money(value)}` : `${t('cash_drawer.shortage')} ${money(Math.abs(value))}`;
  };
  const statusLabel = (estado: string) => t(`cash_drawer.status_${estado}`);
  const historial = isAdmin ? cierres : cajas;
  const receipt = detalle ?? null;

  const summaryRows = (r: Resumen) => (
    <dl className="cash-summary">
      <div><dt>{t('cash_drawer.fund')}</dt><dd>{money(r.fondoInicial)}</dd></div>
      <div><dt>{t('cash_drawer.cash_in')}</dt><dd>{money(r.ingresosEfectivo)}</dd></div>
      <div><dt>{t('cash_drawer.cash_out')}</dt><dd>{money(r.egresosEfectivo)}</dd></div>
      <div className="cash-expected"><dt>{t('cash_drawer.expected')}</dt><dd>{money(r.efectivoEsperado)}</dd></div>
    </dl>
  );
  const methodRows = (totales: Record<string, number>) => (
    <div className="cash-methods" aria-label={t('cash_drawer.by_method')}>
      {METHODS.map(m => <span key={m}>{t(`cash_drawer.method_${m}`)}: <strong>{money(totales[m])}</strong></span>)}
    </div>
  );

  return <div>
    <TopBar title={t('cash_drawer.title')} subtitle={t('cash_drawer.subtitle')} />
    <div className="cash-page">
      {error && <div role="alert" className="operation-error">{error}</div>}
      {success && <div role="status" className="operation-success">{success}</div>}
      {pending && <div role="status" className="operation-card">
        <p>{t('cash_drawer.pending_notice')}</p>
        <button className="btn btn-primary" disabled={busy || isReadOnly} onClick={() => void retryPending()}>{t('cash_drawer.retry')}</button>
      </div>}
      {loading && <p>…</p>}

      {!loading && !abierta && <form className="operation-card operation-form cash-open" onSubmit={openDrawer}>
        <h2>{t('cash_drawer.open_title')}</h2>
        <label>{t('cash_drawer.opening_fund')}
          <input className="form-input" required min="0" step="0.01" type="number" inputMode="decimal" value={fund} disabled={blocked} onChange={e => setFund(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={blocked}>{t('cash_drawer.open_button')}</button>
        <p className="form-hint">{t('cash_drawer.no_open')}</p>
      </form>}

      {abierta && resumen && <>
        <section className="operation-card cash-shift">
          <h2>{t('cash_drawer.summary')}</h2>
          <p className="form-hint">{t('cash_drawer.open_since', { fecha: fecha(abierta.fecha_apertura) })}</p>
          {summaryRows(resumen)}
          {methodRows(resumen.totalesPorMetodo)}
        </section>

        {canRecordManual
          ? <form className="operation-card operation-form" onSubmit={registerMovement}>
              <h2>{t('cash_drawer.movement_title')}</h2>
              <label>{t('cash_drawer.movement_type')}
                <select className="form-input" value={movement.tipo} disabled={blocked} onChange={e => setMovement({ ...movement, tipo: e.target.value })}>
                  <option value="INGRESO_MANUAL">{t('cash_drawer.movement_in')}</option>
                  <option value="EGRESO_MANUAL">{t('cash_drawer.movement_out')}</option>
                </select>
              </label>
              <label>{t('cash_drawer.amount')}
                <input className="form-input" required min="0.01" step="0.01" type="number" inputMode="decimal" value={movement.monto} disabled={blocked} onChange={e => setMovement({ ...movement, monto: e.target.value })} />
              </label>
              <label>{t('cash_drawer.concept')}
                <input className="form-input" required maxLength={200} value={movement.concepto} disabled={blocked} onChange={e => setMovement({ ...movement, concepto: e.target.value })} />
              </label>
              <label>{t('cash_drawer.reference')}
                <input className="form-input" maxLength={100} value={movement.referencia} disabled={blocked} onChange={e => setMovement({ ...movement, referencia: e.target.value })} />
              </label>
              <button className="btn btn-primary" disabled={blocked}>{t('cash_drawer.register')}</button>
            </form>
          : <p className="form-hint">{t('cash_drawer.no_permission')}</p>}

        <section className="operation-card">
          <h2>{t('cash_drawer.movements_title')}</h2>
          {(abierta.movimientos ?? []).length === 0 && <p className="form-hint">{t('cash_drawer.no_movements')}</p>}
          {(abierta.movimientos ?? []).length > 0 && <div className="operation-table"><table>
            <thead><tr><th>{t('cash_drawer.col_time')}</th><th>{t('cash_drawer.col_concept')}</th><th>{t('cash_drawer.col_method')}</th><th>{t('cash_drawer.col_amount')}</th></tr></thead>
            <tbody>{(abierta.movimientos ?? []).map(m => <tr key={m.id}><td>{fecha(m.created_at)}</td><td>{m.concepto}{m.referencia ? ` · ${m.referencia}` : ''}</td><td>{t(`cash_drawer.method_${m.metodo}`)}</td><td>{money(m.monto)}</td></tr>)}</tbody>
          </table></div>}
        </section>

        <form className="operation-card operation-form" onSubmit={closeDrawer}>
          <h2>{t('cash_drawer.close_title')}</h2>
          <label>{t('cash_drawer.counted')}
            <input className="form-input" required min="0" step="0.01" type="number" inputMode="decimal" value={counted} disabled={blocked} onChange={e => setCounted(e.target.value)} />
          </label>
          <p className={`cash-difference ${diferencia && diferencia !== 0 ? 'is-alert' : ''}`} aria-live="polite">
            {t('cash_drawer.difference')}: <strong>{diferencia === null ? '—' : differenceLabel(diferencia)}</strong>
          </p>
          <label>{diferencia && diferencia !== 0 ? t('cash_drawer.explain_difference') : t('cash_drawer.notes')}
            <input className="form-input" maxLength={500} required={diferencia !== null && diferencia !== 0} value={notes} disabled={blocked} onChange={e => setNotes(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={blocked}>{t('cash_drawer.close_button')}</button>
        </form>
      </>}

      {receipt && <section className="operation-card cash-receipt" aria-label={t('cash_drawer.receipt_title')}>
        <h2>{t('cash_drawer.receipt_title')}</h2>
        <p className="form-hint">{receipt.usuario_nombre ?? ''} · {fecha(receipt.fecha_apertura)} → {fecha(receipt.fecha_cierre)}</p>
        {receipt.resumen && summaryRows(receipt.resumen)}
        {receipt.resumen && methodRows(receipt.resumen.totalesPorMetodo)}
        <p><strong>{t('cash_drawer.counted')}:</strong> {money(receipt.monto_cierre_fisico)} · <strong>{t('cash_drawer.difference')}:</strong> {differenceLabel(Number(receipt.diferencia ?? 0))}</p>
        {receipt.notas && <p><strong>{t('cash_drawer.receipt_notes')}:</strong> {receipt.notas}</p>}
        <div className="operation-actions">
          <button className="btn" type="button" onClick={() => window.print()}>{t('cash_drawer.print')}</button>
          <button className="btn" type="button" onClick={() => setDetalle(null)}>{t('cash_drawer.hide')}</button>
        </div>
      </section>}

      <section className="operation-card">
        <h2>{isAdmin ? t('cash_drawer.history_all') : t('cash_drawer.history_title')}</h2>
        {historial.length === 0 && <p className="form-hint">{t('cash_drawer.no_history')}</p>}
        {historial.length > 0 && <div className="operation-table"><table>
          <thead><tr>
            <th>{t('cash_drawer.col_date')}</th>
            {isAdmin && <th>{t('cash_drawer.col_cashier')}</th>}
            <th>{t('cash_drawer.col_status')}</th><th>{t('cash_drawer.col_expected')}</th><th>{t('cash_drawer.col_counted')}</th><th>{t('cash_drawer.col_difference')}</th><th></th>
          </tr></thead>
          <tbody>{historial.map((c: any) => <tr key={c.id}>
            <td>{fecha(c.fecha_apertura)}</td>
            {isAdmin && <td>{c.usuario_nombre ?? '—'}</td>}
            <td>{statusLabel(c.estado)}</td>
            <td>{money(c.estado === 'CERRADA' ? c.monto_esperado : c.efectivoEsperado ?? (Number(c.monto_apertura) + Number(c.efectivo_neto ?? 0)))}</td>
            <td>{c.estado === 'CERRADA' ? money(c.monto_cierre_fisico) : '—'}</td>
            <td>{c.estado === 'CERRADA' ? differenceLabel(Number(c.diferencia)) : '—'}</td>
            <td>{c.estado === 'CERRADA' && <button className="btn" type="button" onClick={() => void verCaja(c.id)}>{t('cash_drawer.view')}</button>}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
    </div>
  </div>;
};
