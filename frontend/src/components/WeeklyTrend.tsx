import React from 'react';
import { BarChart3 } from 'lucide-react';

interface DayTrend {
  dia: string;
  total: number;
  esHoy?: boolean;
}

interface WeeklyTrendProps {
  data?: DayTrend[];
}

const DEFAULT_DAYS: DayTrend[] = [
  { dia: 'JUE', total: 32000 },
  { dia: 'VIE', total: 48500 },
  { dia: 'SAB', total: 54000 },
  { dia: 'DOM', total: 18000 },
  { dia: 'LUN', total: 38200 },
  { dia: 'MAR', total: 39900 },
  { dia: 'HOY', total: 42580, esHoy: true },
];

export const WeeklyTrend: React.FC<WeeklyTrendProps> = ({ data = DEFAULT_DAYS }) => {
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h3 style={styles.title}>TENDENCIA SEMANAL</h3>
        <BarChart3 size={20} strokeWidth={2.4} color="var(--color-primary)" />
      </div>

      <div style={styles.timelineContainer}>
        {data.map((item, index) => (
          <div key={index} style={styles.dayColumn}>
            {/* Horizontal Bar Segment */}
            <div
              style={{
                ...styles.barSegment,
                backgroundColor: item.esHoy ? 'var(--color-primary)' : '#292524',
                height: item.esHoy ? '4px' : '3px',
              }}
            />
            {/* Label */}
            <span
              style={{
                ...styles.dayLabel,
                color: item.esHoy ? 'var(--color-primary)' : 'var(--color-text-main)',
                fontWeight: item.esHoy ? 900 : 700,
              }}
            >
              {item.dia}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: '#FFFFFF',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    boxShadow: 'var(--shadow-hard)',
    padding: '24px 22px',
    marginTop: '24px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '28px',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '14px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-main)',
    margin: 0,
  },
  timelineContainer: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '0 8px',
  },
  dayColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  barSegment: {
    width: '100%',
    borderRadius: '1px',
    transition: 'all 200ms ease',
  },
  dayLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: '12px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
};
