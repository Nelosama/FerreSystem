import React from 'react';
import { TaskShortcuts } from '../components/TaskFinder';
import { TopBar } from '../components/TopBar';
import { MetricCard } from '../components/MetricCard';
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  Coins,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { useTenant } from '../context/TenantContext';
import { formatLempiras } from '../utils/format';
import { api } from '../utils/api';

export const DashboardPage: React.FC = () => {
  const { t } = useI18n();

  const [dashboardError, setDashboardError] = React.useState(false);
  const [dashboardLoading, setDashboardLoading] = React.useState(true);
  const [retry, setRetry] = React.useState(0);
  const [dashboardData, setDashboardData] = React.useState<any>(null);

  // El backend solo entrega el resumen a estos roles. Pedirlo a otros roles produce un 403 falso.
  const { user } = useTenant();
  const puedeVerResumen = ['ADMIN', 'BODEGUERO', 'VENDEDOR'].includes(user?.rol ?? '');

  React.useEffect(() => {
    if (!puedeVerResumen) {
      setDashboardLoading(false);
      return;
    }
    let active = true;
    setDashboardLoading(true);
    setDashboardError(false);
    const fetchDashboard = async () => {
      try {
        const res = await api.get('/dashboard');
        if (active) setDashboardData(res.data);
      } catch (err) {
        if (active) setDashboardError(true);
      } finally {
        if (active) setDashboardLoading(false);
      }
    };
    fetchDashboard();
    return () => { active = false; };
  }, [retry, puedeVerResumen]);

  const totalVentasDia = dashboardData?.ventasDelDia?.total || 0;
  const productosStockBajo = dashboardData?.alertasStock?.items || [];
  const cotizacionesPendientesCount = dashboardData?.cotizacionesPendientes?.cantidad || 0;

  return (
    <div style={styles.container}>
      <TopBar title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <main style={styles.content}>
        <TaskShortcuts />
        {dashboardLoading && <p role="status">Cargando el resumen del negocio…</p>}
        {dashboardError && <div role="alert">No se pudo cargar el resumen. Puedes seguir usando los accesos de arriba. <button type="button" className="btn btn-secondary" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div>}
        {puedeVerResumen && !dashboardLoading && !dashboardError && <>
        {/* Metric Cards Grid */}
        <div style={styles.metricsGrid}>
          {/* Tarjeta 1: Ventas del Día */}
          <MetricCard
            title={t('dashboard.sales_today')}
            value={formatLempiras(totalVentasDia)}
            badgeText="Total registrado hoy"
            badgeVariant="success"
            badgeIcon={<TrendingUp size={13} strokeWidth={2.6} />}
            watermarkIcon={<Coins size={110} strokeWidth={1.5} />}
          />

          {/* Tarjeta 2: Alertas de Stock */}
          <MetricCard
            title={t('dashboard.stock_alerts')}
            value={productosStockBajo.length.toString()}
            valueSuffix="items"
            highlightValue={productosStockBajo.length > 0}
            isHighlighted={productosStockBajo.length > 0}
            badgeText="Requieren reabastecimiento"
            badgeVariant={productosStockBajo.length > 0 ? 'warning' : 'neutral'}
            badgeIcon={<AlertTriangle size={13} strokeWidth={2.6} />}
            watermarkIcon={<AlertCircle size={110} strokeWidth={1.5} />}
          />

          {/* Tarjeta 3: Cotizaciones Pendientes */}
          <MetricCard
            title={t('dashboard.pending_quotations')}
            value={cotizacionesPendientesCount.toString()}
            badgeText="Presupuestos activos"
            badgeVariant="neutral"
            badgeIcon={<Clock size={13} strokeWidth={2.6} />}
            watermarkIcon={<FileText size={110} strokeWidth={1.5} />}
          />
        </div>

        </>}

      </main>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: '100vh',
    backgroundColor: 'var(--color-bg)',
  },
  content: {
    padding: '28px 32px 48px',
    maxWidth: '1400px',
    width: '100%',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '24px',
  },
  quickOpsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: '24px',
    marginTop: '24px',
  },
  actionCard: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '13px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--color-text-main)',
    marginBottom: '16px',
  },
  buttonsRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  alertsCard: {
    display: 'flex',
    flexDirection: 'column',
  },
  alertsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '14px',
  },
  viewAllLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '11px',
    textTransform: 'uppercase',
    color: 'var(--color-primary)',
    textDecoration: 'none',
  },
  alertsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  alertRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    backgroundColor: 'var(--color-bg)',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    gap: '12px',
  },
  itemTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '13px',
    color: 'var(--color-text-main)',
  },
  itemMeta: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },
};
