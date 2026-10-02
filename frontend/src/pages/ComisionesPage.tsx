import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Calendar } from 'lucide-react';
import { formatLempiras } from '../utils/format';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';

export interface VendedorComision {
  usuarioId: string;
  nombre: string;
  email: string;
  porcentajeComision: number;
  totalVendidoPeriodo: number;
  comisionPagar: number;
}

export const ComisionesPage: React.FC = () => {
  const { t } = useI18n();

  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [ventas, setVentas] = useState<any[]>([]);
  const [porcentajes, setPorcentajes] = useState<Record<string, number>>({});

  const [fechaInicio, setFechaInicio] = useState('2026-03-01');
  const [fechaFin, setFechaFin] = useState('2026-03-31');

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const [resUsers, resVentas] = await Promise.all([
          api.get('/usuarios'),
          api.get('/ventas'),
        ]);
        if (Array.isArray(resUsers.data)) {
          setUsuarios(resUsers.data);
        }
        if (Array.isArray(resVentas.data)) {
          setVentas(resVentas.data);
        }
      } catch (err) {
        console.error('Error al cargar datos para comisiones:', err);
      }
    };
    fetchData();
  }, []);

  const vendedores = usuarios.filter((u) => {
    const rol = u.rolBase || u.rol;
    return rol === 'VENDEDOR' || rol === 'CAJERO' || rol === 'ADMIN';
  });

  const handleCambiarPct = (userId: string, val: string) => {
    const num = parseFloat(val) || 0;
    setPorcentajes({ ...porcentajes, [userId]: num });
  };

  return (
    <div style={styles.container}>
      <TopBar title={t('commissions.title')} subtitle={t('commissions.subtitle')} />

      <main style={styles.content}>
        {/* Filtro por Fecha */}
        <div className="industrial-card" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} color="var(--color-primary)" />
            <span style={{ fontWeight: 800, fontSize: '13px', textTransform: 'uppercase' }}>PERÍODO DE LIQUIDACIÓN:</span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="form-input" style={{ width: '150px' }} />
            <span>hasta</span>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="form-input" style={{ width: '150px' }} />
          </div>
        </div>

        <div className="table-container">
          <table className="industrial-table">
            <thead>
              <tr>
                <th>VENDEDOR / CAJERO</th>
                <th>CORREO</th>
                <th style={{ textAlign: 'center' }}>% COMISIÓN CONFIGURADO</th>
                <th style={{ textAlign: 'right' }}>TOTAL VENTAS EN PERÍODO</th>
                <th style={{ textAlign: 'right' }}>COMISIÓN A PAGAR (HNL)</th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map((u) => {
                const pct = porcentajes[u.id] ?? u.comisionPorcentaje ?? 5.0;

                // Filtrar ventas reales por usuario y rango de fechas
                const ventasFiltradasUser = ventas.filter((v) => {
                  if (!v.fecha) return false;
                  const fechaVentaStr = v.fecha.split('T')[0];
                  const esFechaValida = fechaVentaStr >= fechaInicio && fechaVentaStr <= fechaFin;

                  const esMismoUsuario =
                    v.vendedorNombre &&
                    v.vendedorNombre.toLowerCase().includes(u.nombre.toLowerCase().split(' ')[0]);

                  return esFechaValida && esMismoUsuario;
                });

                const totalVendidoPeriodo = ventasFiltradasUser.reduce((acc, v) => acc + v.total, 0);
                const comisionPagar = (totalVendidoPeriodo * pct) / 100;

                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 800 }}>{u.nombre}</td>
                    <td style={{ color: '#78716C' }}>{u.email}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="number"
                          step="0.5"
                          value={pct}
                          onChange={(e) => handleCambiarPct(u.id, e.target.value)}
                          className="form-input"
                          style={{ width: '70px', textAlign: 'center', fontWeight: 800 }}
                        />
                        <span style={{ fontWeight: 800 }}>%</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(totalVendidoPeriodo)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 900, color: '#16A34A', fontSize: '15px' }}>
                      {formatLempiras(comisionPagar)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
    padding: '24px 32px 48px',
    maxWidth: '1400px',
    width: '100%',
  },
};
