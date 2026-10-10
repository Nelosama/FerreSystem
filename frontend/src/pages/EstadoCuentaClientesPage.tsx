import React, { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { formatLempiras } from '../utils/format';
import './OperacionesPage.css';

// Estado de cuenta de clientes (solo ADMIN): facturas a crédito, abonos y saldo, con conciliación
// entre la suma de cuentas abiertas y el saldo que muestra el cliente.
type Abono = { id: string; monto: number; metodo: string; fecha: string; notas: string | null };
type CuentaCliente = { id: string; documento: string; monto: number; saldo: number; vencimiento: string | null; vencida: boolean; creadaEn: string; abonos: Abono[] };
type Estado = {
  cliente: { id: string; codigo: string; numeroCliente: number; nombre: string; creditoHabilitado: boolean; limiteCredito: number | null; saldoPendiente: number };
  saldoCuentas: number; conciliado: boolean; cuentas: CuentaCliente[]; movimientos: Movimiento[];
};
type ClienteBusqueda = { id: string; nombre: string; codigo: string; numeroCliente: number };
type Movimiento = { fecha: string; tipo: 'CARGO' | 'ABONO'; documento: string | null; metodo: string | null; monto: number; usuario: string | null; referencia: string | null; saldoAcumulado: number };

export const EstadoCuentaClientesPage: React.FC = () => {
  const { t } = useI18n();
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<ClienteBusqueda[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const buscar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.get('/clientes', { params: { search: consulta.trim(), limit: '20' } });
      setResultados(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || t('customer_statement.error'));
    }
  };

  useEffect(() => {
    if (!clienteId) { setEstado(null); return; }
    let vigente = true;
    setCargando(true); setError('');
    api.get(`/operaciones/clientes/${clienteId}/estado-cuenta`)
      .then(res => { if (vigente) setEstado(res.data); })
      .catch(err => { if (vigente) setError(err?.response?.data?.message || t('customer_statement.error')); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [clienteId, t]);

  return (
    <div className="operation-page">
      <h1>{t('customer_statement.title')}</h1>
      <form className="operation-card operation-form" onSubmit={buscar} role="search">
        <label>{t('customer_statement.search')}
          <input className="form-input" value={consulta} onChange={e => setConsulta(e.target.value)} placeholder={t('customer_statement.search_hint')} />
        </label>
        <button type="submit">{t('customer_statement.search_button')}</button>
      </form>
      {resultados.length > 0 && (
        <section className="operation-card">
          <h2>{t('customer_statement.results')}</h2>
          <ul>{resultados.map(c => (
            <li key={c.id}><button type="button" onClick={() => setClienteId(c.id)}>{c.codigo} · {c.nombre}</button></li>
          ))}</ul>
        </section>
      )}
      {error && <div className="operation-error" role="alert">{error}</div>}
      {cargando && <p>{t('customer_statement.loading')}</p>}
      {estado && !cargando && (
        <>
          <section className="operation-card" aria-labelledby="customer-statement-resumen">
            <h2 id="customer-statement-resumen">{estado.cliente.nombre} · {estado.cliente.codigo}</h2>
            <p>{t('customer_statement.credit')}: {estado.cliente.creditoHabilitado ? t('customer_statement.enabled') : t('customer_statement.disabled')}</p>
            <p>{t('customer_statement.limit')}: {estado.cliente.limiteCredito === null ? '—' : formatLempiras(estado.cliente.limiteCredito)}</p>
            <p><strong>{t('customer_statement.balance')}: {formatLempiras(estado.cliente.saldoPendiente)}</strong></p>
            {estado.conciliado
              ? <p className="operation-success">{t('customer_statement.reconciled')}</p>
              : <p className="operation-error" role="alert">{t('customer_statement.not_reconciled', { cuentas: formatLempiras(estado.saldoCuentas) })}</p>}
          </section>
          <section className="operation-card">
            <h2>{t('customer_statement.invoices')}</h2>
            {estado.cuentas.length === 0 ? <p>{t('customer_statement.no_invoices')}</p> : estado.cuentas.map(c => (
              <article key={c.id} className="customer-statement-cuenta">
                <h3>{t('customer_statement.invoice')} {c.documento} {c.vencida && <span className="operation-error">{t('customer_statement.overdue')}</span>}</h3>
                <p>{t('customer_statement.amount')}: {formatLempiras(c.monto)} · {t('customer_statement.open')}: {formatLempiras(c.saldo)} · {t('customer_statement.due')}: {c.vencimiento ? new Date(c.vencimiento).toLocaleDateString() : '—'}</p>
                {c.abonos.length === 0 ? <p>{t('customer_statement.no_payments')}</p> : (
                  <div className="operation-table"><table>
                    <thead><tr><th>{t('customer_statement.date')}</th><th>{t('customer_statement.method')}</th><th>{t('customer_statement.payment')}</th></tr></thead>
                    <tbody>{c.abonos.map(a => (
                      <tr key={a.id}><td>{new Date(a.fecha).toLocaleString()}</td><td>{a.metodo}</td><td>{formatLempiras(a.monto)}</td></tr>
                    ))}</tbody>
                  </table></div>
                )}
              </article>
            ))}
          </section>
          <section className="operation-card">
            <h2>{t('customer_statement.movements')}</h2>
            {estado.movimientos.length === 0 ? <p>{t('customer_statement.no_movements')}</p> : (
              <div className="operation-table"><table>
                <thead><tr>
                  <th>{t('customer_statement.date')}</th><th>{t('customer_statement.type')}</th><th>{t('customer_statement.invoice')}</th>
                  <th>{t('customer_statement.amount')}</th><th>{t('customer_statement.running_balance')}</th><th>{t('customer_statement.user')}</th><th>{t('customer_statement.reference')}</th>
                </tr></thead>
                <tbody>{estado.movimientos.map((m, i) => (
                  <tr key={`${m.fecha}-${i}`}>
                    <td>{new Date(m.fecha).toLocaleString()}</td>
                    <td>{m.tipo === 'CARGO' ? t('customer_statement.charge') : t('customer_statement.payment')}{m.metodo ? ` · ${m.metodo}` : ''}</td>
                    <td>{m.documento ?? '—'}</td>
                    <td>{formatLempiras(m.monto)}</td>
                    <td><strong>{formatLempiras(m.saldoAcumulado)}</strong></td>
                    <td>{m.usuario ?? '—'}</td>
                    <td>{m.referencia ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
