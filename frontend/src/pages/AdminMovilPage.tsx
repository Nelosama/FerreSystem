import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { diaCalendarioEnZona, formatLempiras } from '../utils/format';
import {
  clientesConSaldo, cuentasPorVencer, productosBajoStock, solicitudesPendientes, ventasDelDia,
  type ClienteConSaldo, type CuentaPorVencer, type ProductoBajoStock, type ResumenOperativo, type SolicitudDevolucion,
} from '../utils/resumenMovil';
import './AdminMovilPage.css';

// Resumen administrativo para iPhone. Solo ADMIN. Usa únicamente endpoints existentes; cada sección
// carga por separado, así que un fallo parcial no oculta el resto del panel.
type Seccion<T> = { datos: T | null; error: boolean };
const vacia = <T,>(): Seccion<T> => ({ datos: null, error: false });

export const AdminMovilPage: React.FC = () => {
  const { t } = useI18n();
  const [hoy, setHoy] = useState(() => diaCalendarioEnZona());
  const [resumen, setResumen] = useState<Seccion<ResumenOperativo>>(vacia);
  const [cajas, setCajas] = useState<Seccion<any[]>>(vacia);
  const [stock, setStock] = useState<Seccion<ProductoBajoStock[]>>(vacia);
  const [clientes, setClientes] = useState<Seccion<ClienteConSaldo[]>>(vacia);
  const [cxp, setCxp] = useState<Seccion<CuentaPorVencer[]>>(vacia);
  const [solicitudes, setSolicitudes] = useState<Seccion<SolicitudDevolucion[]>>(vacia);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    const hoyNegocio = diaCalendarioEnZona();
    setHoy(hoyNegocio);
    setCargando(true);
    // Cada petición actualiza su propia sección al terminar: una lenta no retrasa a las demás.
    const pedir = <T,>(ruta: string, params: Record<string, string> | undefined, guardar: (s: Seccion<T>) => void, extraer: (data: any) => T) => {
      return api.get(ruta, params ? { params } : undefined)
        .then(res => guardar({ datos: extraer(res.data), error: false }))
        .catch(() => guardar({ datos: null, error: true }));
    };
    await Promise.all([
      pedir<ResumenOperativo>('/operaciones/resumen', { desde: hoyNegocio, hasta: hoyNegocio }, setResumen, d => d ?? {}),
      pedir<any[]>('/operaciones/caja/cierres', { estado: 'ABIERTA' }, setCajas, d => d ?? []),
      pedir<ProductoBajoStock[]>('/productos/alertas/stock-bajo', undefined, setStock, d => d ?? []),
      pedir<ClienteConSaldo[]>('/clientes', { limit: '100' }, setClientes, d => d ?? []),
      pedir<CuentaPorVencer[]>('/operaciones/cuentas', { tipo: 'CXP' }, setCxp, d => d ?? []),
      pedir<SolicitudDevolucion[]>('/operaciones/solicitudes-devolucion', undefined, setSolicitudes, d => d ?? []),
    ]);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const ventas = ventasDelDia(resumen.datos);
  const porVencer = cxp.datos ? cuentasPorVencer(cxp.datos, hoy) : [];
  const bajoStock = stock.datos ? productosBajoStock(stock.datos) : [];
  const conSaldo = clientes.datos ? clientesConSaldo(clientes.datos) : [];
  const pendientes = solicitudes.datos ? solicitudesPendientes(solicitudes.datos) : [];

  const aviso = (seccion: Seccion<unknown>) => seccion.error
    ? <p className="admin-movil-aviso" role="alert">{t('admin_mobile.load_error')}</p>
    : null;

  return (
    <main className="admin-movil" aria-busy={cargando}>
      <header className="admin-movil-encabezado">
        <div>
          <h1>{t('admin_mobile.title')}</h1>
          <p>{t('admin_mobile.day')}: {hoy}</p>
        </div>
        <button type="button" className="admin-movil-refrescar" onClick={() => void cargar()} disabled={cargando}>
          {cargando ? t('admin_mobile.refreshing') : t('admin_mobile.refresh')}
        </button>
      </header>

      <section className="admin-movil-tarjeta" aria-labelledby="admin-movil-ventas">
        <h2 id="admin-movil-ventas">{t('admin_mobile.sales_today')}</h2>
        {aviso(resumen)}
        {resumen.datos && (
          <>
            <p className="admin-movil-cifra">{formatLempiras(ventas.total)}</p>
            <p>{t('admin_mobile.sales_count', { count: ventas.cantidad })}</p>
            <ul className="admin-movil-lista">
              {ventas.porMetodo.map(m => (
                <li key={m.metodo}><span>{m.metodo}</span><strong>{formatLempiras(m.total)}</strong></li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="admin-movil-tarjeta" aria-labelledby="admin-movil-caja">
        <h2 id="admin-movil-caja">{t('admin_mobile.cash')}</h2>
        {aviso(cajas)}
        <Link className="admin-movil-enlace" to="/arqueo-caja">{t('admin_mobile.open_cash')}</Link>
        {cajas.datos && (
          cajas.datos.length === 0
            ? <p>{t('admin_mobile.no_open_cash')}</p>
            : <ul className="admin-movil-lista">
                {cajas.datos.map(caja => (
                  <li key={caja.id}>
                    <span>{caja.usuario_nombre ?? caja.codigo}</span>
                    <strong>{formatLempiras(Number(caja.monto_esperado ?? 0))}</strong>
                  </li>
                ))}
              </ul>
        )}
      </section>

      <section className="admin-movil-tarjeta" aria-labelledby="admin-movil-stock">
        <h2 id="admin-movil-stock">{t('admin_mobile.stock_alerts')}</h2>
        {aviso(stock)}
        <Link className="admin-movil-enlace" to="/inventario">{t('admin_mobile.open_inventory')}</Link>
        {stock.datos && (
          bajoStock.length === 0
            ? <p>{t('admin_mobile.no_stock_alerts')}</p>
            : <ul className="admin-movil-lista">
                {bajoStock.map(p => (
                  <li key={p.id}>
                    <span>{p.nombre}</span>
                    <strong>{Number(p.stockActual)} / {Number(p.stockMinimo)}</strong>
                  </li>
                ))}
              </ul>
        )}
      </section>

      <section className="admin-movil-tarjeta" aria-labelledby="admin-movil-clientes">
        <h2 id="admin-movil-clientes">{t('admin_mobile.customer_balances')}</h2>
        {aviso(clientes)}
        <Link className="admin-movil-enlace" to="/estado-cuenta-clientes">{t('admin_mobile.open_statements')}</Link>
        {clientes.datos && (
          conSaldo.length === 0
            ? <p>{t('admin_mobile.no_customer_balances')}</p>
            : <ul className="admin-movil-lista">
                {conSaldo.map(c => (
                  <li key={c.id}><span>{c.nombre}</span><strong>{formatLempiras(Number(c.saldoPendiente))}</strong></li>
                ))}
              </ul>
        )}
      </section>

      <section className="admin-movil-tarjeta" aria-labelledby="admin-movil-cxp">
        <h2 id="admin-movil-cxp">{t('admin_mobile.supplier_bills_due')}</h2>
        {aviso(cxp)}
        <Link className="admin-movil-enlace" to="/cuentas">{t('admin_mobile.open_accounts')}</Link>
        {cxp.datos && (
          porVencer.length === 0
            ? <p>{t('admin_mobile.no_supplier_bills_due')}</p>
            : <ul className="admin-movil-lista">
                {porVencer.map((c, i) => (
                  <li key={`${c.documento}-${i}`}>
                    <span>{c.nombre} · {c.documento}{c.vencida ? ` · ${t('admin_mobile.overdue')}` : ''}</span>
                    <strong>{formatLempiras(Number(c.saldo))}</strong>
                  </li>
                ))}
              </ul>
        )}
      </section>

      <section className="admin-movil-tarjeta" aria-labelledby="admin-movil-solicitudes">
        <h2 id="admin-movil-solicitudes">{t('admin_mobile.authorization_requests')}</h2>
        {aviso(solicitudes)}
        {solicitudes.datos && (
          pendientes.length === 0
            ? <p>{t('admin_mobile.no_pending_requests')}</p>
            : <ul className="admin-movil-lista">
                {pendientes.map(s => (
                  <li key={s.id}>
                    <span>{t('admin_mobile.return_for_sale')} {s.numero_venta ?? ''}</span>
                    <strong>{formatLempiras(Number(s.total_venta ?? 0))}</strong>
                  </li>
                ))}
              </ul>
        )}
      </section>

      <section className="admin-movil-tarjeta" aria-labelledby="admin-movil-reportes">
        <h2 id="admin-movil-reportes">{t('admin_mobile.reports')}</h2>
        <Link className="admin-movil-enlace" to="/reportes">{t('admin_mobile.open_reports')}</Link>
      </section>
    </main>
  );
};
