import React from 'react';
import { TopBar } from '../components/TopBar';
import { MetricCard } from '../components/MetricCard';
import { WeeklyTrend } from '../components/WeeklyTrend';
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  Coins,
  FileText,
  AlertCircle,
  PlusCircle,
  ShoppingCart,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  return (
    <div style={styles.container}>
      <TopBar title="RESUMEN OPERATIVO" subtitle="Turno Actual: 08:00 AM - 05:00 PM" />

      <main style={styles.content}>
        {/* Metric Cards Grid */}
        <div style={styles.metricsGrid}>
          {/* Tarjeta 1: Ventas del Día */}
          <MetricCard
            title="VENTAS DEL DÍA (HNL)"
            value="L. 42,580.00"
            badgeText="+12% vs ayer"
            badgeVariant="success"
            badgeIcon={<TrendingUp size={13} strokeWidth={2.6} />}
            watermarkIcon={<Coins size={110} strokeWidth={1.5} />}
          />

          {/* Tarjeta 2: Alertas de Stock (Con borde y acento naranja de alerta) */}
          <MetricCard
            title="ALERTAS DE STOCK"
            value="14"
            valueSuffix="items"
            highlightValue={true}
            isHighlighted={true}
            badgeText="Requieren reabastecimiento"
            badgeVariant="warning"
            badgeIcon={<AlertTriangle size={13} strokeWidth={2.6} />}
            watermarkIcon={<AlertCircle size={110} strokeWidth={1.5} />}
          />

          {/* Tarjeta 3: Cotizaciones Pendientes */}
          <MetricCard
            title="COTIZACIONES PENDIENTES"
            value="8"
            badgeText="3 por vencer hoy"
            badgeVariant="neutral"
            badgeIcon={<Clock size={13} strokeWidth={2.6} />}
            watermarkIcon={<FileText size={110} strokeWidth={1.5} />}
          />
        </div>

        {/* Tendencia Semanal */}
        <WeeklyTrend />

        {/* Sección Operativa Rápida (Atajos de POS y Alertas urgentes) */}
        <div style={styles.quickOpsGrid}>
          {/* Card de Accesos Rápidos para el Cajero */}
          <div className="industrial-card" style={styles.actionCard}>
            <h3 style={styles.sectionHeader}>OPERACIONES RÁPIDAS DE CAJA</h3>
            <div style={styles.buttonsRow}>
              <Link to="/pos" className="btn btn-primary" style={{ flex: 1 }}>
                <ShoppingCart size={18} strokeWidth={2.4} />
                <span>NUEVA VENTA POS</span>
              </Link>
              <Link to="/cotizaciones" className="btn btn-secondary" style={{ flex: 1 }}>
                <PlusCircle size={18} strokeWidth={2.4} />
                <span>CREAR COTIZACIÓN</span>
              </Link>
            </div>
          </div>

          {/* Card de Alertas Críticas de Inventario */}
          <div className="industrial-card" style={styles.alertsCard}>
            <div style={styles.alertsHeader}>
              <h3 style={styles.sectionHeader}>ALERTAS URGENTES DE INVENTARIO</h3>
              <Link to="/inventario" style={styles.viewAllLink}>
                Ver catálogo <ArrowRight size={14} />
              </Link>
            </div>
            <div style={styles.alertsList}>
              <div style={styles.alertRow}>
                <div>
                  <div style={styles.itemTitle}>Varilla Corrugada 3/8" Grado 40 (6m)</div>
                  <div style={styles.itemMeta}>Cód: CON-002 • Mínimo requerido: 40 unidades</div>
                </div>
                <span className="badge badge-danger">5 en bodega</span>
              </div>

              <div style={styles.alertRow}>
                <div>
                  <div style={styles.itemTitle}>Cable THHN Calibre 12 AWG (100m)</div>
                  <div style={styles.itemMeta}>Cód: ELE-001 • Mínimo requerido: 10 rollos</div>
                </div>
                <span className="badge badge-danger">2 en bodega</span>
              </div>
            </div>
          </div>
        </div>
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
    backgroundColor: '#FAFAF9',
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
