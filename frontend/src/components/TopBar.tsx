import React from 'react';
import { Calendar, Clock, UserCheck, LogOut } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle = 'Turno Actual: 08:00 AM - 05:00 PM',
}) => {
  const { user, logout } = useTenant();
  const navigate = useNavigate();

  // Formato de fecha del día de hoy generado dinámicamente en español
  const getDynamicDate = () => {
    const date = new Date();
    const day = date.getDate();
    const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `HOY, ${day} ${month} ${year}`;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
          <span>{getDynamicDate()}</span>
        </div>

        {/* Info Cajero/Admin y Botón de Cerrar Sesión */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={styles.userBadge}>
              <UserCheck size={14} strokeWidth={2.4} color="var(--color-primary)" />
              <span>{user.nombre}</span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              style={styles.logoutBtn}
              title="Cerrar Sesión"
            >
              <LogOut size={14} strokeWidth={2.4} />
              <span>SALIR</span>
            </button>
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
  logoutBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '11px',
    letterSpacing: '0.03em',
    padding: '8px 12px',
    border: '1.5px solid #EF4444',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
};
