import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { diaCalendarioEnZona, formatLempiras } from '../utils/format';
import './OperacionesPage.css';

// Conciliación del POS bancario (solo ADMIN). Registra el total del cierre del banco por terminal y día; el sistema
// lo compara con las autorizaciones de tarjeta registradas en esa terminal. Las diferencias exigen motivo.
type Conciliacion = {
  id: string; terminal: string; fecha: string; total_banco: number | string; cantidad_banco: number;
  total_sistema: number | string; cantidad_sistema: number; diferencia: number | string; motivo: string | null;
  created_at: string; usuario_nombre: string;
};

export const ConciliacionBancariaPage: React.FC = () => {
  const { t } = useI18n();
  const [terminal, setTerminal] = useState('');
  const [fecha, setFecha] = useState(() => diaCalendarioEnZona());
  const [totalBanco, setTotalBanco] = useState('');
  const [cantidadBanco, setCantidadBanco] = useState('');
  const [motivo, setMotivo] = useState('');
  const [solicitudId, setSolicitudId] = useState(() => crypto.randomUUID());
  const [registros, setRegistros] = useState<Conciliacion[]>([]);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await api.get('/operaciones/conciliaciones-bancarias');
      setRegistros(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || t('bank_recon.error'));
    }
  }, [t]);

  useEffect(() => { void cargar(); }, [cargar]);

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setError(''); setMensaje('');
    try {
      const res = await api.post('/operaciones/conciliaciones-bancarias', {
        solicitudId, terminal: terminal.trim(), fecha, totalBanco: Number(totalBanco),
        cantidadBanco: Number(cantidadBanco), motivo: motivo.trim() || undefined,
      });
      const r: Conciliacion = res.data;
      setMensaje(Number(r.diferencia) === 0 ? t('bank_recon.matched') : t('bank_recon.registered_with_difference'));
      setSolicitudId(crypto.randomUUID());
      setTerminal(''); setTotalBanco(''); setCantidadBanco(''); setMotivo('');
      await cargar();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || (err?.response ? t('bank_recon.error') : t('bank_recon.network')));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="operation-page">
      <h1>{t('bank_recon.title')}</h1>
      <p className="form-hint">{t('bank_recon.help')}</p>
      <form className="operation-card operation-form" onSubmit={registrar} aria-label={t('bank_recon.form')}>
        <label>{t('bank_recon.terminal')}<input className="form-input" required maxLength={40} value={terminal} disabled={enviando} onChange={e => setTerminal(e.target.value)} /></label>
        <label>{t('bank_recon.date')}<input className="form-input" type="date" required max={diaCalendarioEnZona()} value={fecha} disabled={enviando} onChange={e => setFecha(e.target.value)} /></label>
        <label>{t('bank_recon.bank_total')}<input className="form-input" type="number" required min="0" step="0.01" value={totalBanco} disabled={enviando} onChange={e => setTotalBanco(e.target.value)} /></label>
        <label>{t('bank_recon.bank_count')}<input className="form-input" type="number" required min="0" step="1" value={cantidadBanco} disabled={enviando} onChange={e => setCantidadBanco(e.target.value)} /></label>
        <label>{t('bank_recon.reason')}<input className="form-input" maxLength={500} value={motivo} disabled={enviando} onChange={e => setMotivo(e.target.value)} /></label>
        <p className="form-hint">{t('bank_recon.reason_hint')}</p>
        <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? t('bank_recon.saving') : t('bank_recon.register')}</button>
      </form>
      {error && <div className="operation-error" role="alert">{error}</div>}
      {mensaje && <div className="operation-success" role="status">{mensaje}</div>}
      <section className="operation-card">
        <h2>{t('bank_recon.history')}</h2>
        {registros.length === 0 ? <p>{t('bank_recon.empty')}</p> : (
          <div className="operation-table"><table>
            <thead><tr>
              <th>{t('bank_recon.date')}</th><th>{t('bank_recon.terminal')}</th><th>{t('bank_recon.bank_total')}</th>
              <th>{t('bank_recon.system_total')}</th><th>{t('bank_recon.difference')}</th><th>{t('bank_recon.reason')}</th><th>{t('bank_recon.by')}</th>
            </tr></thead>
            <tbody>{registros.map(r => (
              <tr key={r.id}>
                <td>{r.fecha.slice(0, 10)}</td><td>{r.terminal}</td>
                <td>{formatLempiras(Number(r.total_banco))} · {r.cantidad_banco}</td>
                <td>{formatLempiras(Number(r.total_sistema))} · {r.cantidad_sistema}</td>
                <td>{Number(r.diferencia) === 0 ? t('bank_recon.none') : formatLempiras(Number(r.diferencia))}</td>
                <td>{r.motivo ?? '—'}</td><td>{r.usuario_nombre}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
};
