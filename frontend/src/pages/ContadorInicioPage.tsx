import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { diaCalendarioEnZona, formatLempiras } from '../utils/format';
import { consultaPeriodo, etiquetaHallazgo, mensajeError, mensajeErrorDescarga, periodoAnterior } from '../utils/contabilidad';
import { descargarReporte } from '../utils/descargaContabilidad';
import { ContadorSecciones } from '../components/ContadorSecciones';
import './OperacionesPage.css';

type Fila = Record<string, any>;
const L = (v: unknown) => formatLempiras(Number(v ?? 0));

/** Inicio del módulo de Contabilidad: estado del período, alertas y las cuatro acciones más frecuentes. Solo lectura. */
export const ContadorInicioPage: React.FC = () => {
  const { t } = useI18n();
  const [periodo, setPeriodo] = useState(() => periodoAnterior(diaCalendarioEnZona()));
  const [datos, setDatos] = useState<{ isv?: Fila; conciliacion?: Fila; balanza?: Fila }>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const q = consultaPeriodo(periodo);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [isv, conciliacion, balanza] = await Promise.all([`/contabilidad/resumen-isv?${q}`, `/contabilidad/conciliacion?${q}`, `/contabilidad/balanza?${q}`].map(async r => (await api.get(r)).data as Fila));
      setDatos({ isv, conciliacion, balanza });
    } catch (e) { setDatos({}); setError(mensajeError(e, t, t('accounting.load_error'))); }
    finally { setCargando(false); }
  }, [q, t]);
  useEffect(() => { void cargar(); }, [cargar]);

  const descargar = async (reporte: string) => {
    setError(''); setMensaje('');
    try { setMensaje(t('accounting.file_ready', { name: await descargarReporte(reporte, 'xlsx', periodo) })); }
    catch (e) { setError(await mensajeErrorDescarga(e, t, t('accounting.export_error'))); }
  };

  const { isv, conciliacion, balanza } = datos;
  const hallazgos: Fila[] = conciliacion?.hallazgos ?? [];
  const cuadra = balanza?.totales?.cuadra;
  const mesValor = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`;
  const sinDoc = Number(isv?.ventasSinDocumento?.cantidad ?? 0) + Number(isv?.comprasSinDocumento?.cantidad ?? 0);

  return (
    <div className="operation-page" data-testid="contabilidad-page">
      <ContadorSecciones />
      <h1>{t('accounting.nav.home')}</h1>
      <p className="form-hint">{t('accounting.home_help')}</p>
      <div className="operation-card operation-actions">
        <label>{t('accounting.period')}{' '}
          <input className="form-input" type="month" aria-label={t('accounting.period')} value={mesValor} max={diaCalendarioEnZona().slice(0, 7)}
            onChange={e => { const [a, m] = e.target.value.split('-').map(Number); if (a && m) setPeriodo({ anio: a, mes: m }); }} />
        </label>
      </div>
      {error && <div className="operation-error" role="alert">{error}</div>}
      {mensaje && <div className="operation-success" role="status">{mensaje}</div>}
      {cargando && <p aria-busy="true">{t('accounting.loading')}</p>}
      {!cargando && conciliacion && isv && balanza && (
        <>
          <div className="contador-tarjetas">
            <section className="contador-tarjeta" aria-label={t('accounting.card.period')}>
              <h2>{t('accounting.card.period')}</h2>
              <strong>{t(`accounting.period_state.${conciliacion.estadoPeriodo}`)}</strong>
            </section>
            <section className="contador-tarjeta" aria-label={t('accounting.card.balance')}>
              <h2>{t('accounting.card.balance')}</h2>
              <strong>{cuadra ? t('accounting.balanced') : t('accounting.unbalanced')}</strong>
              <small>{t('accounting.debit_col')} {L(balanza.totales?.debe)} · {t('accounting.credit_col')} {L(balanza.totales?.haber)}</small>
            </section>
            <section className="contador-tarjeta" aria-label={t('accounting.card.alerts')}>
              <h2>{t('accounting.card.alerts')}</h2>
              <strong>{hallazgos.length === 0 ? t('accounting.no_findings') : t('accounting.check_findings_n', { n: conciliacion.total })}</strong>
              {sinDoc > 0 && <small>{t('accounting.without_doc_n', { n: sinDoc })}</small>}
            </section>
            <section className="contador-tarjeta" aria-label={t('accounting.card.isv')}>
              <h2>{t('accounting.card.isv')}</h2>
              <strong>{t(`accounting.result.${isv.tipoResultado}`)}: {L(isv.resultado)}</strong>
              <small>{t('accounting.isv_notice')}</small>
            </section>
          </div>
          <section className="operation-card" aria-label={t('accounting.quick_actions')}>
            <h2>{t('accounting.quick_actions')}</h2>
            <div className="contador-acciones">
              <Link className="btn btn-primary" to="/contabilidad/asientos">{t('accounting.new_entry')}</Link>
              <button type="button" className="btn btn-secondary" onClick={() => void descargar('balanza')}>{t('accounting.download_balance')}</button>
              <button type="button" className="btn btn-secondary" onClick={() => void descargar('mensual')}>{t('accounting.export_month_book')}</button>
              <Link className="btn btn-secondary" to="/contabilidad/cierre">{t('accounting.close_month')}</Link>
            </div>
          </section>
          {hallazgos.length > 0 && (
            <section className="operation-card" aria-label={t('accounting.card.alerts')}>
              <h2>{t('accounting.card.alerts')}</h2>
              <div className="operation-table"><table>
                <thead><tr><th>{t('accounting.book')}</th><th>{t('accounting.finding_col')}</th><th>{t('accounting.reference')}</th></tr></thead>
                <tbody>{hallazgos.slice(0, 5).map((h, i) => <tr key={i}><td>{h.libro}</td><td>{etiquetaHallazgo(h.codigo, t)}</td><td>{h.referencia}</td></tr>)}</tbody>
              </table></div>
              {hallazgos.length > 5 && <p className="form-hint">{t('accounting.more_in_reports')} <Link to="/contabilidad/reportes">{t('accounting.nav.reports')}</Link></p>}
            </section>
          )}
        </>
      )}
    </div>
  );
};
