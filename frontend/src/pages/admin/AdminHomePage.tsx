import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Clock, Coins, FileText, Plus, TrendingUp } from 'lucide-react';
import { TopBar } from '../../components/TopBar';
import { SyncStatus } from '../../components/SyncStatus';
import { useTenant } from '../../context/TenantContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { availableTasks } from '../../utils/taskNavigation';
import { api } from '../../utils/api';
import { formatLempiras } from '../../utils/format';
import './admin-dashboard.css';

// Respuesta de GET /dashboard (backend/src/dashboard/dashboard.service.ts). Solo se usan estos campos.
interface DashboardResponse {
  ventasDelDia: { total: number; cantidad: number; variacionPorcentaje: number | null };
  tendenciaSemanal: { dia: string; fecha: string; total: number; esHoy: boolean }[];
  ultimasVentas: { id: string; numeroVenta: string | number; cliente: string; cajero: string; total: number; metodoPago: string; hora: string }[];
  alertasStock: { cantidad: number; items: { id: string; codigo: string; nombre: string; stockActual: number | string; stockMinimo: number | string; unidadMedida: string }[] };
  cotizacionesPendientes: { cantidad: number; porVencerHoy: number };
}

// Ventas y caja se refrescan cada 30 s; el resumen completo usa el mismo endpoint.
const INTERVALO_RESUMEN_MS = 30_000;

// Accesos rápidos: solo los que el rol y los módulos del negocio permiten (filtrados por availableTasks).
const ACCESOS_RAPIDOS = ['pos', 'cotizaciones', 'inventario', 'clientes', 'cuentas', 'entregas'];

// Indicadores que el backend todavía no calcula. Se muestran como «Próximamente», nunca con cifras.
const PROXIMAMENTE = ['Ganancia estimada', 'Ticket promedio', 'Por cobrar', 'Entregas pendientes', 'Estado del inventario', 'Apertura de caja'];

const etiquetaMetodo: Record<string, string> = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', CREDITO: 'Crédito' };

export const AdminHomePage: React.FC = () => {
  const { user, tenant } = useTenant();
  const [datos, setDatos] = useState<DashboardResponse | null>(null);

  const cargar = useCallback((signal: AbortSignal) => api.get<DashboardResponse>('/dashboard', { signal }).then(res => res.data), []);
  const aplicar = useCallback((value: DashboardResponse) => { setDatos(value); }, []);
  const { sync } = useAutoRefresh<DashboardResponse>({
    load: cargar,
    apply: aplicar,
    intervalMs: INTERVALO_RESUMEN_MS,
    deps: [user?.id, tenant.id],
  });

  // Un fallo queda visible sin borrar el último dato válido.
  const sinDatos = !datos;
  const errorVisible = sync.phase === 'error' && sinDatos;
  const accesos = availableTasks(user, tenant).filter(item => ACCESOS_RAPIDOS.includes(item.key));
  const alertas = datos?.alertasStock.items ?? [];
  const variacion = datos?.ventasDelDia.variacionPorcentaje;

  return (
    <div className="admin-home">
      <TopBar title="Panel administrativo" subtitle="Resumen del negocio de hoy" />
      <main className="admin-home__main">
        <header className="admin-home__cabecera">
          <div>
            <h1 className="admin-home__titulo">Hola, {user?.nombre ?? 'administrador'}</h1>
            <SyncStatus sync={sync} />
          </div>
          <nav className="admin-home__acciones" aria-label="Accesos rápidos">
            {accesos.map(item => (
              <Link key={item.key} to={item.route} className="admin-home__acceso">{item.defaultLabel}</Link>
            ))}
          </nav>
        </header>

        {errorVisible && (
          <div role="alert" className="admin-home__aviso">
            No se pudo cargar el resumen. Se reintentará automáticamente; mientras tanto puede usar los accesos rápidos.
          </div>
        )}

        <section className="admin-home__metricas" aria-label="Indicadores de hoy">
          <article className="admin-home__metrica">
            <span className="admin-home__metrica-etiqueta">Ventas del día</span>
            <strong className="admin-home__metrica-cifra">{datos ? formatLempiras(datos.ventasDelDia.total) : '—'}</strong>
            <span className="admin-home__metrica-pie">
              <TrendingUp size={14} aria-hidden="true" />
              {datos
                ? `${datos.ventasDelDia.cantidad} venta(s)${variacion == null ? '' : ` · ${variacion > 0 ? '+' : ''}${variacion}% vs. ayer`}`
                : 'Cargando…'}
            </span>
          </article>
          <article className={`admin-home__metrica${alertas.length > 0 ? ' admin-home__metrica--alerta' : ''}`}>
            <span className="admin-home__metrica-etiqueta">Alertas de inventario</span>
            <strong className="admin-home__metrica-cifra">{datos ? datos.alertasStock.cantidad : '—'}</strong>
            <span className="admin-home__metrica-pie"><AlertTriangle size={14} aria-hidden="true" />Productos bajo mínimo</span>
          </article>
          <article className="admin-home__metrica">
            <span className="admin-home__metrica-etiqueta">Cotizaciones pendientes</span>
            <strong className="admin-home__metrica-cifra">{datos ? datos.cotizacionesPendientes.cantidad : '—'}</strong>
            <span className="admin-home__metrica-pie"><FileText size={14} aria-hidden="true" />
              {datos ? `${datos.cotizacionesPendientes.porVencerHoy} vencen hoy` : 'Cargando…'}
            </span>
          </article>
          <article className="admin-home__metrica admin-home__metrica--pendiente">
            <span className="admin-home__metrica-etiqueta">Indicadores en preparación</span>
            <strong className="admin-home__metrica-cifra admin-home__metrica-cifra--pendiente">Próximamente</strong>
            <span className="admin-home__metrica-pie"><Clock size={14} aria-hidden="true" />{PROXIMAMENTE.length} indicadores</span>
          </article>
        </section>

        <div className="admin-home__rejilla">
          <section className="admin-home__tarjeta" aria-labelledby="home-tendencia">
            <h2 id="home-tendencia" className="admin-home__subtitulo">Tendencia semanal</h2>
            {datos ? <TendenciaSemanal dias={datos.tendenciaSemanal} /> : <p className="admin-home__vacio">Cargando tendencia…</p>}
          </section>

          <section className="admin-home__tarjeta" aria-labelledby="home-alertas">
            <h2 id="home-alertas" className="admin-home__subtitulo">Alertas de inventario</h2>
            {!datos ? <p className="admin-home__vacio">Cargando alertas…</p>
              : alertas.length === 0 ? <p className="admin-home__vacio">Sin productos bajo mínimo.</p>
              : (
                <ul className="admin-home__lista">
                  {alertas.slice(0, 5).map(p => (
                    <li key={p.id} className="admin-home__fila">
                      <div>
                        <strong>{p.nombre}</strong>
                        <span className="admin-home__meta">{p.codigo}</span>
                      </div>
                      <span className="admin-home__chip admin-home__chip--alerta">{String(p.stockActual)} / mín. {String(p.stockMinimo)} {p.unidadMedida}</span>
                    </li>
                  ))}
                </ul>
              )}
            <p className="admin-home__pendiente">Estado porcentual del inventario: Próximamente</p>
          </section>

          <section className="admin-home__tarjeta" aria-labelledby="home-ventas">
            <h2 id="home-ventas" className="admin-home__subtitulo">Últimas ventas</h2>
            {!datos ? <p className="admin-home__vacio">Cargando ventas…</p>
              : datos.ultimasVentas.length === 0 ? <p className="admin-home__vacio">Aún no hay ventas registradas.</p>
              : (
                <ul className="admin-home__lista">
                  {datos.ultimasVentas.map(v => (
                    <li key={v.id} className="admin-home__fila">
                      <div>
                        <strong>{v.cliente}</strong>
                        <span className="admin-home__meta">#{v.numeroVenta} · {v.hora} · {etiquetaMetodo[v.metodoPago] ?? v.metodoPago}</span>
                      </div>
                      <span className="admin-home__importe">{formatLempiras(v.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          <section className="admin-home__tarjeta" aria-labelledby="home-cotizaciones">
            <h2 id="home-cotizaciones" className="admin-home__subtitulo">Cotizaciones pendientes</h2>
            {!datos ? <p className="admin-home__vacio">Cargando cotizaciones…</p> : (
              <div className="admin-home__cotizaciones">
                <p><strong>{datos.cotizacionesPendientes.cantidad}</strong> activas</p>
                <p><strong>{datos.cotizacionesPendientes.porVencerHoy}</strong> vencen hoy</p>
                <Link to="/cotizaciones" className="admin-home__enlace">Ver cotizaciones <ArrowUpRight size={14} aria-hidden="true" /></Link>
              </div>
            )}
          </section>

          <section className="admin-home__tarjeta admin-home__tarjeta--pendiente" aria-labelledby="home-proximamente">
            <h2 id="home-proximamente" className="admin-home__subtitulo">En preparación</h2>
            <ul className="admin-home__pendientes">
              {PROXIMAMENTE.map(nombre => (
                <li key={nombre}><Coins size={13} aria-hidden="true" /> {nombre} <span>Próximamente</span></li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      <Link to="/pos" className="admin-home__flotante" aria-label="Nueva venta">
        <Plus size={22} aria-hidden="true" />
        <span>Nueva venta</span>
      </Link>
    </div>
  );
};

// Gráfico SVG de los últimos 7 días. Usa solo ventas reales; sin datos muestra un estado vacío.
const TendenciaSemanal: React.FC<{ dias: DashboardResponse['tendenciaSemanal'] }> = ({ dias }) => {
  const maximo = Math.max(0, ...dias.map(d => d.total));
  if (dias.length === 0 || maximo === 0) {
    return <p className="admin-home__vacio">Sin ventas completadas en los últimos 7 días.</p>;
  }
  const ancho = 420;
  const alto = 160;
  const paso = ancho / dias.length;
  const barra = paso * 0.56;
  return (
    <figure className="admin-home__grafico">
      <svg viewBox={`0 0 ${ancho} ${alto + 28}`} role="img" aria-label="Ventas de los últimos 7 días">
        {dias.map((d, i) => {
          const altura = Math.max(2, (d.total / maximo) * alto);
          const x = i * paso + (paso - barra) / 2;
          return (
            <g key={d.fecha}>
              <title>{`${d.fecha}: ${formatLempiras(d.total)}`}</title>
              <rect x={x} y={alto - altura} width={barra} height={altura} rx={4}
                className={d.esHoy ? 'admin-home__barra admin-home__barra--hoy' : 'admin-home__barra'} />
              <text x={x + barra / 2} y={alto + 18} textAnchor="middle" className="admin-home__eje">{d.dia}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="admin-home__meta">Máximo del periodo: {formatLempiras(maximo)}</figcaption>
    </figure>
  );
};
