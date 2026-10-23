import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CalendarDays, ChevronRight, CircleDollarSign, ClipboardList, FileText, HandCoins, Package, PackagePlus, ShieldAlert, Tags, Truck, WalletCards, type LucideIcon } from 'lucide-react';
import { TopBar } from '../../components/TopBar';
import { SyncStatus } from '../../components/SyncStatus';
import { useTenant } from '../../context/TenantContext';
import { useI18n } from '../../context/I18nContext';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { availableTasks } from '../../utils/taskNavigation';
import { filtrarAccesosMovilAdmin } from '../../utils/movilAdmin';
import { api } from '../../utils/api';
import { diaCalendarioEnZona, formatLempiras } from '../../utils/format';
import { estadoPendientes, normalizarPendientes, type ClavePendiente, type IndicadorPendiente } from '../../utils/pendientesInicio';
import { diasEntre, fechaCorta, resumirCuentas, type ResumenCuentas } from '../../utils/cuentasInicio';
import './admin-dashboard.css';

// Respuesta de GET /dashboard (backend/src/dashboard/dashboard.service.ts). Solo se usan estos campos.
interface DashboardResponse {
  ventasDelDia: { total: number; cantidad: number; variacionPorcentaje: number | null };
  tendenciaSemanal: { dia: string; fecha: string; total: number; esHoy: boolean }[];
  ultimasVentas: { id: string; numeroVenta: string | number; cliente: string; cajero: string; total: number; metodoPago: string; hora: string }[];
  alertasStock: { cantidad: number; items: { id: string; codigo: string; nombre: string; stockActual: number | string; stockMinimo: number | string; unidadMedida: string }[] };
  cotizacionesPendientes: { cantidad: number; porVencerHoy: number };
}

// Ventas y caja se refrescan cada 30 s; los pendientes (conteos en PostgreSQL) cada 60 s; las cuentas, que el servidor
// devuelve completas, cada 90 s. Todos se actualizan además al volver a la pestaña o recuperar la red.
const INTERVALO_RESUMEN_MS = 30_000;
const INTERVALO_PENDIENTES_MS = 60_000;
const INTERVALO_CUENTAS_MS = 90_000;
// Acciones frecuentes: como máximo cuatro, según lo que el usuario puede usar en este negocio.
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

// Acciones frecuentes: cada una abre la pantalla existente del módulo. Solo se ofrecen las autorizadas y habilitadas.
const ACCIONES: { clave: string; icono: LucideIcon; titulo: string; ayuda: string }[] = [
  { clave: 'inventario', icono: PackagePlus, titulo: 'shell.home.add_product', ayuda: 'shell.home.add_product_help' },
  { clave: 'ordenes_compra', icono: ClipboardList, titulo: 'shell.home.register_purchase', ayuda: 'shell.home.register_purchase_help' },
  { clave: 'cuentas', icono: HandCoins, titulo: 'shell.home.receive_payment', ayuda: 'shell.home.receive_payment_help' },
  { clave: 'cotizaciones', icono: FileText, titulo: 'shell.home.create_quote', ayuda: 'shell.home.create_quote_help' },
];

type Tono = 'teal' | 'blue' | 'amber' | 'red';
interface IndicadorProps { etiqueta: string; valor: string; ayuda: string; icono: LucideIcon; tono: Tono; to?: string; alerta?: boolean; id: string }

const Indicador: React.FC<IndicadorProps> = ({ etiqueta, valor, ayuda, icono: Icon, tono, to, alerta, id }) => {
  const cuerpo = (
    <>
      <span className={`admin-home__icono-kpi admin-home__icono-kpi--${tono}`}><Icon size={21} aria-hidden="true" /></span>
      <span className="admin-home__kpi-texto">
        <span className="admin-home__metrica-etiqueta">{etiqueta}</span>
        <strong className="admin-home__metrica-cifra">{valor}</strong>
        <span className="admin-home__metrica-pie">{ayuda}</span>
      </span>
    </>
  );
  const clase = `admin-home__kpi${alerta ? ' admin-home__kpi--alerta' : ''}${to ? ' admin-home__kpi--enlace' : ''}`;
  return to
    ? <Link to={to} className={clase} data-kpi={id}>{cuerpo}</Link>
    : <article className={clase} data-kpi={id}>{cuerpo}</article>;
};

export const AdminHomePage: React.FC = () => {
  const { user, tenant } = useTenant();
  const { t } = useI18n();
  const movil = useMediaQuery('(max-width: 768px)');
  const [datos, setDatos] = useState<DashboardResponse | null>(null);
  const [pendientes, setPendientes] = useState<IndicadorPendiente[] | null>(null);
  const [porCobrar, setPorCobrar] = useState<ResumenCuentas | null>(null);
  const [porPagar, setPorPagar] = useState<ResumenCuentas | null>(null);

  // Datos disponibles (rol, permisos y módulos del negocio) y accesos que la interfaz actual ofrece (en móvil, sin operaciones).
  const todasLasTareas = availableTasks(user, tenant);
  const tareas = filtrarAccesosMovilAdmin(todasLasTareas, user, movil);
  const ofrece = (clave: string) => tareas.some(item => item.key === clave);
  const rutaDe = (clave: string) => tareas.find(item => item.key === clave)?.route;
  const consultaCuentas = todasLasTareas.some(item => item.key === 'cuentas');

  const cargar = useCallback((signal: AbortSignal) => api.get<Partial<DashboardResponse>>('/dashboard', { signal }).then(res => normalizarResumen(res.data)), []);
  const aplicar = useCallback((value: DashboardResponse) => { setDatos(value); }, []);
  const { sync } = useAutoRefresh<DashboardResponse>({ load: cargar, apply: aplicar, intervalMs: INTERVALO_RESUMEN_MS, deps: [user?.id, tenant.id] });

  // Una respuesta inválida rechaza la promesa: se muestra como error, nunca como «sin pendientes».
  const cargarPendientes = useCallback((signal: AbortSignal) => api.get('/dashboard/pendientes', { signal }).then(res => normalizarPendientes(res.data)), []);
  const aplicarPendientes = useCallback((value: IndicadorPendiente[]) => { setPendientes(value); }, []);
  const { sync: syncPendientes } = useAutoRefresh<IndicadorPendiente[]>({ load: cargarPendientes, apply: aplicarPendientes, intervalMs: INTERVALO_PENDIENTES_MS, deps: [user?.id, tenant.id] });

  // Cuentas por cobrar y por pagar: solo si el módulo de cuentas está habilitado y autorizado para este usuario.
  const cargarPorCobrar = useCallback((signal: AbortSignal) => api.get('/operaciones/cuentas', { params: { tipo: 'CXC' }, signal }).then(res => resumirCuentas(res.data)), []);
  const aplicarPorCobrar = useCallback((value: ResumenCuentas) => { setPorCobrar(value); }, []);
  const { sync: syncPorCobrar } = useAutoRefresh<ResumenCuentas>({ load: cargarPorCobrar, apply: aplicarPorCobrar, intervalMs: INTERVALO_CUENTAS_MS, enabled: consultaCuentas, deps: [user?.id, tenant.id, consultaCuentas] });
  const cargarPorPagar = useCallback((signal: AbortSignal) => api.get('/operaciones/cuentas', { params: { tipo: 'CXP' }, signal }).then(res => resumirCuentas(res.data)), []);
  const aplicarPorPagar = useCallback((value: ResumenCuentas) => { setPorPagar(value); }, []);
  const { sync: syncPorPagar } = useAutoRefresh<ResumenCuentas>({ load: cargarPorPagar, apply: aplicarPorPagar, intervalMs: INTERVALO_CUENTAS_MS, enabled: consultaCuentas, deps: [user?.id, tenant.id, consultaCuentas] });

  // Al cambiar de usuario o negocio, las cifras anteriores dejan de valer (se descartan durante el render).
  const propietario = `${user?.id ?? ''}:${tenant.id}`;
  const [propietarioDatos, setPropietarioDatos] = useState(propietario);
  if (propietarioDatos !== propietario) { setPropietarioDatos(propietario); setDatos(null); setPendientes(null); setPorCobrar(null); setPorPagar(null); }

  // Un fallo queda visible sin borrar el último dato válido.
  const errorVisible = sync.phase === 'error' && !datos;
  const falloPendientes = syncPendientes.phase === 'error' || syncPendientes.phase === 'offline';
  const estado = estadoPendientes(pendientes, falloPendientes);
  const falloCobrar = !porCobrar && (syncPorCobrar.phase === 'error' || syncPorCobrar.phase === 'offline');
  const falloPagar = !porPagar && (syncPorPagar.phase === 'error' || syncPorPagar.phase === 'offline');

  const alertas = datos?.alertasStock.items ?? [];
  const variacion = datos?.ventasDelDia.variacionPorcentaje;
  const titulo = (i: IndicadorPendiente) => t(PRESENTACION[i.clave].titulo);
  const rutaCuentas = rutaDe('cuentas');

  // Vencimiento más cercano de las facturas de proveedores, en lenguaje del negocio (hoy, mañana o fecha).
  const cuandoVence = (dia: string) => {
    const dias = diasEntre(diaCalendarioEnZona(), dia);
    return dias <= 0 ? t('shell.home.due_today') : dias === 1 ? t('shell.home.due_tomorrow') : t('shell.home.due_on', { date: fechaCorta(dia) });
  };
  const ayudaCobrar = falloCobrar ? t('shell.home.accounts_error')
    : !porCobrar ? t('shell.home.loading')
    : `${t('shell.home.receivable_count', { count: porCobrar.abiertas })}${porCobrar.vencidas > 0 ? t('shell.home.overdue_suffix', { count: porCobrar.vencidas }) : ''}`;
  const ayudaPagar = falloPagar ? t('shell.home.accounts_error')
    : !porPagar ? t('shell.home.loading')
    : porPagar.vencidas > 0 ? t('shell.home.bills_overdue', { count: porPagar.vencidas })
    : porPagar.proximoVencimiento ? t('shell.home.bills_next', { when: cuandoVence(porPagar.proximoVencimiento) })
    : t('shell.home.bills_none');

  // Vencidas: se suman a «necesita tu atención» con su cifra real; en móvil se muestran sin enlace a la pantalla de cobros.
  const extras = [
    porPagar && porPagar.vencidas > 0 ? { clave: 'cxp_vencidas', cantidad: porPagar.vencidas, titulo: t('shell.home.overdue_bills'), detalle: t('shell.home.overdue_bills_detail'), icono: <CalendarDays size={18} aria-hidden="true" /> } : null,
    porCobrar && porCobrar.vencidas > 0 ? { clave: 'cxc_vencidas', cantidad: porCobrar.vencidas, titulo: t('shell.home.overdue_receivable'), detalle: t('shell.home.overdue_receivable_detail'), icono: <WalletCards size={18} aria-hidden="true" /> } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  const hayExtras = extras.length > 0;

  const acciones = ACCIONES.filter(a => ofrece(a.clave)).slice(0, MAXIMO_ACCIONES);
  const puedeInventario = ofrece('inventario');
  const puedeReportes = ofrece('reportes');
  const negocio = tenant.nombreComercial || t('shell.business_default');

  return (
    <div className="admin-home">
      <TopBar title={t('shell.home.greeting', { name: user?.nombre ?? t('shell.home.greeting_fallback') })} subtitle={t('shell.home.lead', { business: negocio })} />
      <main className="admin-home__main">
        <div className="admin-home__sync"><SyncStatus sync={sync} /></div>

        {errorVisible && (
          <div role="alert" className="admin-home__aviso">{t('shell.home.summary_error')}</div>
        )}

        {/* Cuatro indicadores prioritarios, todos con datos de los servicios existentes. */}
        <section className="admin-home__kpis" aria-label={t('shell.home.indicators')}>
          <Indicador id="ventas" etiqueta={t('shell.home.sales_today')} icono={CircleDollarSign} tono="teal" to={puedeReportes ? rutaDe('reportes') : undefined}
            valor={datos ? formatLempiras(datos.ventasDelDia.total) : '—'}
            ayuda={datos
              ? `${t('shell.home.sales_count', { count: datos.ventasDelDia.cantidad })}${variacion == null ? '' : t('shell.home.vs_yesterday', { value: `${variacion > 0 ? '+' : ''}${variacion}` })}`
              : t('shell.home.loading')} />
          {consultaCuentas && (
            <Indicador id="por-cobrar" etiqueta={t('shell.home.kpi_receivable')} icono={WalletCards} tono="blue" to={rutaCuentas}
              valor={porCobrar ? formatLempiras(porCobrar.saldo) : '—'} ayuda={ayudaCobrar} alerta={!!porCobrar && porCobrar.vencidas > 0} />
          )}
          {consultaCuentas && (
            <Indicador id="facturas" etiqueta={t('shell.home.kpi_bills')} icono={CalendarDays} tono="amber" to={rutaCuentas}
              valor={porPagar ? String(porPagar.abiertas) : '—'} ayuda={ayudaPagar} alerta={!!porPagar && porPagar.vencidas > 0} />
          )}
          <Indicador id="stock" etiqueta={t('shell.home.stock_alerts')} icono={AlertTriangle} tono="red" to={puedeInventario ? rutaDe('inventario') : undefined}
            valor={datos ? t('shell.home.stock_value', { count: datos.alertasStock.cantidad }) : '—'}
            ayuda={datos ? t('shell.home.below_minimum') : t('shell.home.loading')} alerta={alertas.length > 0} />
        </section>

        <div className="admin-home__rejilla-principal">
          {acciones.length > 0 && (
            <section className="admin-home__tarjeta" aria-labelledby="home-acciones">
              <h2 id="home-acciones" className="admin-home__subtitulo">{t('shell.home.frequent')}</h2>
              <p className="admin-home__ayuda">{t('shell.home.frequent_help')}</p>
              <nav className="admin-home__acciones" aria-label={t('shell.home.actions')}>
                {acciones.map(a => {
                  const Icon = a.icono;
                  return (
                    <Link key={a.clave} to={rutaDe(a.clave)!} className="admin-home__accion" data-accion={a.clave}>
                      <span className="admin-home__accion-icono"><Icon size={20} aria-hidden="true" /></span>
                      <span className="admin-home__accion-texto"><strong>{t(a.titulo)}</strong><small>{t(a.ayuda)}</small></span>
                      <ChevronRight size={17} aria-hidden="true" className="admin-home__chevron" />
                    </Link>
                  );
                })}
              </nav>
            </section>
          )}

          {/* Lo que requiere una acción hoy. Cifras confirmadas por GET /dashboard/pendientes y por las cuentas vencidas. */}
          <section className="admin-home__tarjeta admin-home__pendientes" aria-labelledby="home-pendientes" aria-busy={estado.tipo === 'cargando'} data-estado={estado.tipo}>
            <h2 id="home-pendientes" className="admin-home__subtitulo">{t('shell.home.attention')}</h2>
            <p className="admin-home__ayuda">{t('shell.home.attention_help')}</p>
            {estado.tipo === 'cargando' && <p className="admin-home__vacio" role="status">{t('shell.home.pending_loading')}</p>}
            {estado.tipo === 'error' && <p className="admin-home__aviso admin-home__aviso--compacto" role="alert">{t('shell.home.pending_error')}</p>}
            {estado.tipo === 'sin_indicadores' && !hayExtras && <p className="admin-home__vacio">{t('shell.home.pending_unavailable')}</p>}
            {estado.tipo === 'al_dia' && !hayExtras && <p className="admin-home__vacio admin-home__al-dia" role="status">{t('shell.home.pending_none')}</p>}
            {(estado.tipo === 'con_pendientes' || hayExtras) && (
              <>
                <ul className="admin-home__lista">
                  {estado.tipo === 'con_pendientes' && estado.activos.map(i => (
                    <li key={i.clave}>
                      <Link to={i.ruta} className="admin-home__fila admin-home__fila--enlace" data-pendiente={i.clave} aria-label={`${titulo(i)}: ${i.cantidad}`}>
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
                  {extras.map(e => {
                    const contenido = (
                      <>
                        <span className="admin-home__icono">{e.icono}</span>
                        <div>
                          <strong>{e.titulo}</strong>
                          <span className="admin-home__meta">{e.detalle}</span>
                        </div>
                        <span className="admin-home__contador">{e.cantidad}</span>
                      </>
                    );
                    return (
                      <li key={e.clave}>
                        {rutaCuentas
                          ? <Link to={rutaCuentas} className="admin-home__fila admin-home__fila--enlace" data-pendiente={e.clave} aria-label={`${e.titulo}: ${e.cantidad}`}>{contenido}<ChevronRight size={16} aria-hidden="true" className="admin-home__chevron" /></Link>
                          : <div className="admin-home__fila" data-pendiente={e.clave} aria-label={`${e.titulo}: ${e.cantidad}`}>{contenido}</div>}
                      </li>
                    );
                  })}
                </ul>
                {estado.tipo === 'con_pendientes' && estado.alDia.length > 0 && (
                  <p className="admin-home__meta admin-home__al-dia">{t('shell.home.up_to_date', { list: estado.alDia.map(titulo).join(' · ') })}</p>
                )}
              </>
            )}
          </section>
        </div>

        <section className="admin-home__tarjeta" aria-labelledby="home-ventas">
          <div className="admin-home__encabezado-tarjeta">
            <div>
              <h2 id="home-ventas" className="admin-home__subtitulo">{t('shell.home.recent_sales')}</h2>
              <p className="admin-home__ayuda">{t('shell.home.recent_help')}</p>
            </div>
            {puedeReportes && <Link to={rutaDe('reportes')!} className="admin-home__enlace">{t('shell.home.see_reports')} <ArrowUpRight size={14} aria-hidden="true" /></Link>}
          </div>
          {!datos ? <p className="admin-home__vacio" role="status">{t('shell.home.sales_loading')}</p>
            : datos.ultimasVentas.length === 0 ? <p className="admin-home__vacio">{t('shell.home.sales_empty')}</p>
            : (
              <div className="admin-home__tabla-contenedor">
                <table className="admin-home__tabla">
                  <thead>
                    <tr>
                      <th scope="col">{t('shell.home.col_time')}</th>
                      <th scope="col">{t('shell.home.col_sale')}</th>
                      <th scope="col">{t('shell.home.col_customer')}</th>
                      <th scope="col">{t('shell.home.col_cashier')}</th>
                      <th scope="col">{t('shell.home.col_method')}</th>
                      <th scope="col" className="admin-home__num">{t('shell.home.col_total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.ultimasVentas.map(v => (
                      <tr key={v.id}>
                        <td>{v.hora}</td>
                        <td>#{v.numeroVenta}</td>
                        <td>{v.cliente}</td>
                        <td>{v.cajero}</td>
                        <td>{etiquetaMetodo[v.metodoPago] ?? v.metodoPago}</td>
                        <td className="admin-home__num">{formatLempiras(v.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>

        <div className="admin-home__rejilla">
          <section className="admin-home__tarjeta" aria-labelledby="home-tendencia">
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
                  {puedeInventario && <Link to={rutaDe('inventario')!} className="admin-home__enlace">{t('shell.home.see_inventory')} <ArrowUpRight size={14} aria-hidden="true" /></Link>}
                </>
              )}
          </section>
        </div>
      </main>
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
