import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Calendar } from 'lucide-react';
import { formatLempiras } from '../utils/format';
import { useMockData } from '../context/MockDataContext';

export interface VendedorComision {
  usuarioId: string;
  nombre: string;
  email: string;
  porcentajeComision: number;
  totalVendidoPeriodo: number;
  comisionPagar: number;
}

export const ComisionesPage: React.FC = () => {
  const { usuarios, ventas } = useMockData();

  const [porcentajes, setPorcentajes] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('ferre_mock_comisiones_pct');
    return saved ? JSON.parse(saved) : { 'user-demo-vendedor': 3.0, 'user-demo-1': 1.5, 'user-demo-admin': 2.0 };
  });

  React.useEffect(() => {
    localStorage.setItem('ferre_mock_comisiones_pct', JSON.stringify(porcentajes));
  }, [porcentajes]);

  const [fechaInicio, setFechaInicio] = useState('2026-03-01');
  const [fechaFin, setFechaInicioFin] = useState('2026-03-31');

  const vendedores = usuarios.filter((u) => u.rolBase === 'VENDEDOR' || u.rolBase === 'CAJERO' || u.rolBase === 'ADMIN');

  const totalVentasRegistradas = ventas.reduce((acc, v) => acc + v.total, 0);

  const handleCambiarPct = (userId: string, val: string) => {
    const num = parseFloat(val) || 0;
    setPorcentajes({ ...porcentajes, [userId]: num });
  };

  return (
    <div style={styles.container}>
      <TopBar title="REPORTE Y CÁLCULO DE COMISIONES DE VENTA" subtitle="Incentivos por desempeño y volumen facturado" />

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
            <input type="date" value={fechaFin} onChange={(e) => setFechaInicioFin(e.target.value)} className="form-input" style={{ width: '150px' }} />
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
                const pct = porcentajes[u.id] ?? 2.0;
                const ventasUser = u.rolBase === 'VENDEDOR' ? totalVentasRegistradas * 0.6 : totalVentasRegistradas * 0.4;
                const comision = (ventasUser * pct) / 100;

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
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(ventasUser)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 900, color: '#16A34A', fontSize: '15px' }}>
                      {formatLempiras(comision)}
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
