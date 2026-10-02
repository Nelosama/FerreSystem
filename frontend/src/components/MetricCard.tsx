import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  highlightValue?: boolean;
  valueSuffix?: string;
  badgeText: string;
  badgeVariant?: 'success' | 'warning' | 'danger' | 'neutral';
  badgeIcon?: React.ReactNode;
  watermarkIcon?: React.ReactNode;
  isHighlighted?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  highlightValue = false,
  valueSuffix,
  badgeText,
  badgeVariant = 'neutral',
  badgeIcon,
  watermarkIcon,
  isHighlighted = false,
}) => {
  return (
    <div
      style={{
        ...styles.card,
        ...(isHighlighted ? styles.highlightedCard : {}),
      }}
    >
      {/* Background Watermark Icon */}
      {watermarkIcon && <div style={styles.watermark}>{watermarkIcon}</div>}

      <div style={styles.content}>
        <div style={styles.title}>{title}</div>

        <div style={styles.valueRow}>
          <span
            style={{
              ...styles.valueText,
              color: highlightValue ? 'var(--color-primary)' : 'var(--color-text-main)',
            }}
          >
            {value}
          </span>
          {valueSuffix && <span style={styles.valueSuffix}>{valueSuffix}</span>}
        </div>

        {/* Industrial Badge */}
        <div style={styles.badgeWrapper}>
          <div style={{ ...styles.badge, ...getBadgeStyle(badgeVariant) }}>
            {badgeIcon}
            <span>{badgeText}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

function getBadgeStyle(variant: string): React.CSSProperties {
  switch (variant) {
    case 'success':
      return {
        backgroundColor: '#DCFCE7',
        color: '#15803D',
        borderColor: '#15803D',
      };
    case 'warning':
      return {
        backgroundColor: '#FFEDD5',
        color: 'var(--color-primary)',
        borderColor: 'var(--color-primary)',
      };
    case 'danger':
      return {
        backgroundColor: '#FEE2E2',
        color: '#B91C1C',
        borderColor: '#B91C1C',
      };
    default:
      return {
        backgroundColor: '#F5F5F4',
        color: '#292524',
        borderColor: '#292524',
      };
  }
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: '#FFFFFF',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    boxShadow: 'var(--shadow-hard)',
    padding: '24px 22px',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '190px',
  },
  highlightedCard: {
    borderColor: 'var(--color-primary)',
    boxShadow: '3px 3px 0px var(--color-primary)',
  },
  watermark: {
    position: 'absolute',
    right: '12px',
    top: '20px',
    opacity: 0.08,
    pointerEvents: 'none',
    zIndex: 0,
  },
  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '12px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#78716C',
    marginBottom: '12px',
  },
  valueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    margin: '8px 0 16px',
    flexWrap: 'wrap',
  },
  valueText: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '32px',
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
  },
  valueSuffix: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '18px',
    color: 'var(--color-text-main)',
  },
  badgeWrapper: {
    display: 'flex',
    alignItems: 'center',
    marginTop: 'auto',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '11px',
    letterSpacing: '0.03em',
    padding: '6px 10px',
    border: '1.5px solid',
    borderRadius: 'var(--radius-xs)',
  },
};
