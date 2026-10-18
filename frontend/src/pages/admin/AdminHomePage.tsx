import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, ChevronRight, FileText, Package, Plus, ShieldAlert, Tags, Truck, TrendingUp } from 'lucide-react';
import { TopBar } from '../../components/TopBar';
import { SyncStatus } from '../../components/SyncStatus';
import { TaskShortcuts } from '../../components/TaskFinder';
import { useTenant } from '../../context/TenantContext';
import { useI18n } from '../../context/I18nContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { availableTasks } from '../../utils/taskNavigation';
import { api } from '../../utils/api';
import { formatLempiras } from '../../utils/format';
import { estadoPendientes, normalizarPendientes, type ClavePendiente, type IndicadorPendiente } from '../../utils/pendientesInicio';
import './admin-dashboard.css';

// Respuesta de GET /dashboard (backend/src/dashboard/dashboard.service.ts). Solo se usan estos campos.
interface DashboardResponse {
  ventasDelDia: { total: number; cantidad: number; variacionPorcentaje: number | null };
  tendenciaSemanal: { dia: string; fecha: string; total: number; esHoy: boolean }[];
  ultimasVentas: { id: string; numeroVenta: string | number; cliente: string; cajero: string; total: number; metodoPago: string; hora: string }[];
  alertasStock: { cantidad: number; items: { id: string; codigo: string; nombre: string; stockActual: number | string; stockMinimo: number | string; unidadMedida: string }[] };
  cotizacionesPendientes: { cantidad: number; porVencerHoy: number };
}

// Ventas y caja se refrescan cada 30 s; los pendientes (conteos en PostgreSQL) cada 60 s y al volver a la pestaña.
const INTERVALO_RESUMEN_MS = 30_000;
const INTERVALO_PENDIENTES_MS = 60_000;
// Acciones principales del inicio: como máximo cuatro entre la cabecera y los accesos por tarea.
const MAXIMO_ACCIONES = 4;

// Completa una respuesta parcial o malformada con valores neutros: nunca se pintan cifras inventadas.
const normalizarResumen = (raw: Partial<DashboardResponse> | null | undefined): DashboardResponse => ({
  ventasDelDia: { total: Number(raw?.ventasDelDia?.total) || 0, cantidad: Number(raw?.ventasDelDia?.cantidad) || 0, variacionPorcentaje: raw?.ventasDelDia?.variacionPorcentaje ?? null },
  tendenciaSemanal: Array.isArray(raw?.tendenciaSemanal) ? raw.tendenciaSemanal : [],
  ultimasVentas: Array.isArray(raw?.ultimasVentas) ? raw.ultimasVentas : [],
  alertasStock: { cantidad: Number(raw?.alertasStock?.cantidad) || 0, items: Array.isArray(raw?.alertasStock?.items) ? raw.alertasStock.items : [] },
  cotizacionesPendientes: { cantidad: Number(raw?.cotizacionesPendientes?.cantidad) || 0, porVencerHoy: Number(raw?.cotizacionesPendientes?.porVencerHoy) || 0 },
});

const etiquetaMetodo: Record<string, string> = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', CREDITO: 'Crédito' };

// Presentación de cada pendiente. Las reglas (quién lo ve y cómo se cuenta) viven en el servidor.
const PRESENTACION: Record<ClavePendiente, { icono: React.ReactNode; titulo: string; detalle: string }> = {
  contingencia_revision: { icono: <ShieldAlert size={18} aria-hidden="true" />, titulo: 'shell.home.review', detalle: 'shell.home.review_detail' },
  precios_pendientes: { icono: <Tags size={18} aria-hidden="true" />, titulo: 'shell.home.prices', detalle: 'shell.home.prices_detail' },
  entregas_pendientes: { icono: <Truck size={18} aria-hidden="true" />, titulo: 'shell.home.deliveries', detalle: 'shell.home.deliveries_detail' },
  cotizaciones_vencen_hoy: { icono: <FileText size={18} aria-hidden="true" />, titulo: 'shell.home.quotes', detalle: 'shell.home.quotes_detail' },
  stock_bajo_minimo: { icono: <Package size={18} aria-hidden="true" />, titulo: 'shell.home.stock', detalle: 'shell.home.stock_detail' },
};

export const AdminHomePage: React.FC = () => {
  const { user, tenant } = useTenant();
  const { t } = useI18n();
  const [datos, setDatos] = useState<DashboardResponse | null>(null);
  const [pendientes, setPendientes] = useState<IndicadorPendiente[] | null>(null);

  const cargar = useCallback((signal: AbortSignal) => api.get<Partial<DashboardResponse>>('/dashboard', { signal }).then(res => normalizarResumen(res.data)), []);
  const aplicar = useCallback((value: DashboardResponse) => { setDatos(value); }, []);
  const { sync } = useAutoRefresh<DashboardResponse>({
    load: cargar,
    apply: aplicar,
    intervalMs: INTERVALO_RESUMEN_MS,
    deps: [user?.id, tenant.id],
  });

  // Una respuesta inválida rechaza la promesa: se muestra como error, nunca como «sin pendientes».
  const cargarPendientes = useCallback((signal: AbortSignal) => api.get('/dashboard/pendientes', { signal }).then(res => normalizarPendientes(res.data)), []);
  const aplicarPendientes = useCallback((value: IndicadorPendiente[]) => { setPendientes(value); }, []);
  const { sync: syncPendientes } = useAutoRefresh<IndicadorPendiente[]>({
    load: cargarPendientes,
    apply: aplicarPendientes,
    intervalMs: INTERVALO_PENDIENTES_MS,
    deps: [user?.id, tenant.id],
  });
  // Al cambiar de usuario o negocio, las cifras anteriores dejan de valer (se descartan durante el render).
  const propietario = `${user?.id ?? ''}:${tenant.id}`;
  const [propietarioDatos, setPropietarioDatos] = useState(propietario);
  if (propietarioDatos !== propietario) { setPropietarioDatos(propietario); setDatos(null); setPendientes(null); }

  // Un fallo queda visible sin borrar el último dato válido.
  const errorVisible = sync.phase === 'error' && !datos;
  const falloPendientes = syncPendientes.phase === 'error' || syncPendientes.phase === 'offline';
  const estado = estadoPendientes(pendientes, falloPendientes);
  const tareas = availableTasks(user, tenant);
  const puedeVender = tareas.some(item => item.key === 'pos');
  const puedeCotizar = tareas.some(item => item.key === 'cotizaciones');
  const puedeInventario = tareas.some(item => item.key === 'inventario');
  const accionesCabecera = Number(puedeVender) + Number(puedeCotizar);
  const alertas = datos?.alertasStock.items ?? [];
  const variacion = datos?.ventasDelDia.variacionPorcentaje;
  const titulo = (i: IndicadorPendiente) => t(PRESENTACION[i.clave].titulo);

  return (
    <div className="admin-home">
      <TopBar title={t('shell.home.title')} subtitle={t('shell.home.subtitle')} />
      <main className="admin-home__main">
        <header className="admin-home__cabecera">
          <div>
            <h1 className="admin-home__titulo">{t('shell.home.greeting', { name: user?.nombre ?? t('shell.home.greeting_fallback') })}</h1>
            <SyncStatus sync={sync} />
          </div>
          {accionesCabecera > 0 && (
            <nav className="admin-home__acciones" aria-label={t('shell.home.actions')}>
              {puedeCotizar && <Link to="/cotizaciones" className="admin-home__acceso"><FileText size={15} aria-hidden="true" /> {t('shell.home.new_quote')}</Link>}
              {puedeVender && <Link to="/pos" className="admin-home__acceso admin-home__acceso--principal"><Plus size={15} aria-hidden="true" /> {t('shell.home.new_sale')}</Link>}
            </nav>
          )}
        </header>

        {/* Lo que requiere una acción hoy va primero. Cifras confirmadas por GET /dashboard/pendientes. */}
        <section className="admin-home__pendientes" aria-labelledby="home-pendientes" aria-busy={estado.tipo === 'cargando'} data-estado={estado.tipo}>
          <h2 id="home-pendientes" className="admin-home__subtitulo">{t('shell.home.pending')}</h2>
          {estado.tipo === 'cargando' && <p className="admin-home__vacio" role="status">{t('shell.home.pending_loading')}</p>}
          {estado.tipo === 'error' && <p className="admin-home__aviso admin-home__aviso--compacto" role="alert">{t('shell.home.pending_error')}</p>}
          {estado.tipo === 'sin_indicadores' && <p className="admin-home__vacio">{t('shell.home.pending_unavailable')}</p>}
          {estado.tipo === 'al_dia' && <p className="admin-home__vacio admin-home__al-dia" role="status">{t('shell.home.pending_none')}</p>}
          {estado.tipo === 'con_pendientes' && (
            <>
              <ul className="admin-home__lista">
                {estado.activos.map(i => (
                  <li key={i.clave}>
                    <Link to={i.ruta} className="admin-home__fila admin-home__fila--enlace" data-pendiente={i.clave}
                      aria-label={`${titulo(i)}: ${i.cantidad}`}>
                      <span className="admin-home__icono">{PRESENTACION[i.clave].icono}</span>
                      <div>
                        <strong>{titulo(i)}</strong>
                        <span className="admin-home__meta">{t(i.alcance === 'PROPIAS' && i.clave === 'entregas_pendientes' ? 'shell.home.deliveries_own' : PRESENTACION[i.clave].detalle)}</span>
                      </div>
                      <span className="admin-home__contador">{i.cantidad}</span>
                      <ChevronRight size={16} aria-hidden="true" className="admin-home__chevron" />
                    </Link>
                  </li>
                ))}
              </ul>
              {estado.alDia.length > 0 && (
                <p className="admin-home__meta admin-home__al-dia">{t('shell.home.up_to_date', { list: estado.alDia.map(titulo).join(' · ') })}</p>
              )}
            </>
          )}
        </section>

        {/* Accesos por tarea del negocio, sin repetir las acciones de la cabecera: cuatro acciones principales en total. */}
        <TaskShortcuts exclude={['pos', 'cotizaciones']} limit={MAXIMO_ACCIONES - accionesCabecera} />

        {errorVisible && (
          <div role="alert" className="admin-home__aviso">{t('shell.home.summary_error')}</div>
        )}

        <section className="admin-home__metricas" aria-label={t('shell.home.indicators')}>
          <article className="admin-home__metrica">
            <span className="admin-home__metrica-etiqueta">{t('shell.home.sales_today')}</span>
            <strong className="admin-home__metrica-cifra">{datos ? formatLempiras(datos.ventasDelDia.total) : '—'}</strong>
            <span className="admin-home__metrica-pie">
              <TrendingUp size={14} aria-hidden="true" />
              {datos
                ? `${t('shell.home.sales_count', { count: datos.ventasDelDia.cantidad })}${variacion == null ? '' : t('shell.home.vs_yesterday', { value: `${variacion > 0 ? '+' : ''}${variacion}` })}`
                : t('shell.home.loading')}
            </span>
          </article>
          <article className={`admin-home__metrica${alertas.length > 0 ? ' admin-home__metrica--alerta' : ''}`}>
            <span className="admin-home__metrica-etiqueta">{t('shell.home.stock_alerts')}</span>
            <strong className="admin-home__metrica-cifra">{datos ? datos.alertasStock.cantidad : '—'}</strong>
            <span className="admin-home__metrica-pie"><AlertTriangle size={14} aria-hidden="true" />{t('shell.home.below_minimum')}</span>
          </article>
          <article className="admin-home__metrica">
            <span className="admin-home__metrica-etiqueta">{t('shell.home.open_quotes')}</span>
            <strong className="admin-home__metrica-cifra">{datos ? datos.cotizacionesPendientes.cantidad : '—'}</strong>
            <span className="admin-home__metrica-pie"><FileText size={14} aria-hidden="true" />
              {datos ? t('shell.home.expire_today', { count: datos.cotizacionesPendientes.porVencerHoy }) : t('shell.home.loading')}
            </span>
            {puedeCotizar && <Link to="/cotizaciones" className="admin-home__enlace">{t('shell.home.see_quotes')} <ArrowUpRight size={14} aria-hidden="true" /></Link>}
          </article>
        </section>

        <div className="admin-home__rejilla">
          <section className="admin-home__tarjeta admin-home__tarjeta--ancha" aria-labelledby="home-tendencia">
            <h2 id="home-tendencia" className="admin-home__subtitulo">{t('shell.home.trend')}</h2>
            {datos ? <TendenciaSemanal dias={datos.tendenciaSemanal} /> : <p className="admin-home__vacio" role="status">{t('shell.home.trend_loading')}</p>}
          </section>

          <section className="admin-home__tarjeta" aria-labelledby="home-alertas">
            <h2 id="home-alertas" className="admin-home__subtitulo">{t('shell.home.stock_alerts')}</h2>
            {!datos ? <p className="admin-home__vacio" role="status">{t('shell.home.alerts_loading')}</p>
              : alertas.length === 0 ? <p className="admin-home__vacio">{t('shell.home.alerts_empty')}</p>
              : (
                <>
                  <ul className="admin-home__lista">
                    {alertas.slice(0, 5).map(p => (
                      <li key={p.id} className="admin-home__fila">
                        <div>
                          <strong>{p.nombre}</strong>
                          <span className="admin-home__meta">{p.codigo}</span>
                        </div>
                        <span className="admin-home__chip admin-home__chip--alerta">{String(p.stockActual)} / {t('shell.home.minimum')} {String(p.stockMinimo)} {p.unidadMedida}</span>
                      </li>
                    ))}
                  </ul>
                  {puedeInventario && <Link to="/inventario" className="admin-home__enlace">{t('shell.home.see_inventory')} <ArrowUpRight size={14} aria-hidden="true" /></Link>}
                </>
              )}
          </section>

          <section className="admin-home__tarjeta" aria-labelledby="home-ventas">
            <h2 id="home-ventas" className="admin-home__subtitulo">{t('shell.home.recent_sales')}</h2>
            {!datos ? <p className="admin-home__vacio" role="status">{t('shell.home.sales_loading')}</p>
              : datos.ultimasVentas.length === 0 ? <p className="admin-home__vacio">{t('shell.home.sales_empty')}</p>
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
        </div>
      </main>

      {puedeVender && (
        <Link to="/pos" className="admin-home__flotante" aria-label={t('shell.home.new_sale')}>
          <Plus size={22} aria-hidden="true" />
          <span>{t('shell.home.new_sale')}</span>
        </Link>
      )}
    </div>
  );
};

// Gráfico SVG de los últimos 7 días. Usa solo ventas reales; sin datos muestra un estado vacío.
const TendenciaSemanal: React.FC<{ dias: DashboardResponse['tendenciaSemanal'] }> = ({ dias }) => {
  const { t } = useI18n();
  const maximo = Math.max(0, ...dias.map(d => d.total));
  if (dias.length === 0 || maximo === 0) {
    return <p className="admin-home__vacio">{t('shell.home.trend_empty')}</p>;
  }
  const ancho = 420;
  const alto = 160;
  const paso = ancho / dias.length;
  const barra = paso * 0.56;
  return (
    <figure className="admin-home__grafico">
      <svg viewBox={`0 0 ${ancho} ${alto + 28}`} role="img" aria-label={t('shell.home.trend_label')}>
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
      <figcaption className="admin-home__meta">{t('shell.home.trend_max', { value: formatLempiras(maximo) })}</figcaption>
    </figure>
  );
};
