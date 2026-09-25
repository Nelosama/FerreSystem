import React from 'react';
import { Calendar, Clock, UserCheck } from 'lucide-react';
import { useTenant } from '../context/TenantContext';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle = 'Turno Actual: 08:00 AM - 05:00 PM',
}) => {
  const { user } = useTenant();

  // Formato de fecha del día de hoy
  const hoyFormatted = 'HOY, 25 SEP 2026';

  return (
    <header style={styles.header}>
      <div style={styles.titleContainer}>
        <div style={styles.headingWrapper}>
          <h1 style={styles.mainTitle}>{title}</h1>
          <div style={styles.accentUnderline} />
        </div>
        <div style={styles.shiftInfo}>
          <Clock size={14} strokeWidth={2.4} style={{ color: 'var(--color-text-muted)' }} />
          <span>{subtitle}</span>
        </div>
      </div>

      <div style={styles.actionsContainer}>
        {/* Badge de Fecha Oficial */}
        <div style={styles.dateBadge}>
          <Calendar size={15} strokeWidth={2.5} />
          <span>{hoyFormatted}</span>
        </div>

        {/* Info Cajero/Admin */}
        {user && (
          <div style={styles.userBadge}>
            <UserCheck size={14} strokeWidth={2.4} color="var(--color-primary)" />
            <span>{user.nombre}</span>
          </div>
        )}
      </div>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '24px 32px 18px',
    backgroundColor: 'var(--color-bg)',
    borderBottom: '2px solid var(--color-border)',
    flexWrap: 'wrap',
    gap: '16px',
  },
  titleContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  headingWrapper: {
    display: 'inline-block',
    position: 'relative',
  },
  mainTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '28px',
    fontWeight: 900,
    letterSpacing: '-0.02em',
    textTransform: 'uppercase',
    color: 'var(--color-text-main)',
    margin: 0,
    paddingBottom: '4px',
  },
  accentUnderline: {
    width: '100%',
    height: '4px',
    backgroundColor: 'var(--color-primary)',
    borderRadius: '1px',
  },
  shiftInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'var(--font-body)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
  },
  actionsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '4px',
  },
  dateBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'var(--color-sidebar-bg)',
    color: '#FAFAF9',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '12px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '10px 14px',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    boxShadow: '2px 2px 0px var(--color-border)',
  },
  userBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FFFFFF',
    color: 'var(--color-text-main)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '11px',
    letterSpacing: '0.03em',
    padding: '8px 12px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
  },
};
