import React, { useCallback, useState } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [fechaInicio, setFechaInicio] = useState(`${currentMonth}-01`);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const [fechaFin, setFechaFin] = useState(`${currentMonth}-${String(monthEnd).padStart(2, '0')}`);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [resUsers, firstSalesPage] = await Promise.all([
        api.get('/usuarios'),
        api.get('/ventas', { params: { limit: 500, page: 0 } }),
      ]);
      if (!Array.isArray(resUsers.data) || !Array.isArray(firstSalesPage.data)) {
        throw new Error('Respuesta inválida al cargar datos de comisiones');
      }
      const allSales = [...firstSalesPage.data];
      let page = 1;
      while (firstSalesPage.data.length === 500) {
        const nextPage = await api.get('/ventas', { params: { limit: 500, page } });
        if (!Array.isArray(nextPage.data)) throw new Error('Respuesta inválida al cargar ventas');
        allSales.push(...nextPage.data);
        if (nextPage.data.length < 500) break;
        page += 1;
      }
      setUsuarios(resUsers.data);
      setVentas(allSales);
    } catch (err) {
      console.error('Error al cargar datos para comisiones:', err);
      setUsuarios([]);
      setVentas([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchData(); }, [fetchData]);

  const vendedores = usuarios.filter((u) => {
    const rol = u.rolBase || u.rol;
    return rol === 'VENDEDOR' || rol === 'CAJERO' || rol === 'ADMIN';
  });

  const handleCambiarPct = (userId: string, val: string) => {
    const num = parseFloat(val) || 0;
    setPorcentajes({ ...porcentajes, [userId]: num });
  };
  const invalidDateRange = fechaInicio > fechaFin;

  return (
    <div style={styles.container}>
      <TopBar title={t('commissions.title')} subtitle={t('commissions.subtitle')} />

      <main style={styles.content}>
        {loadError && <div role="alert" className="operation-error">{t('common.load_error')} <button type="button" className="btn btn-secondary" onClick={() => void fetchData()}>{t('common.retry')}</button></div>}
        {loading && <p role="status">{t('common.loading')}</p>}
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

        {invalidDateRange && <p role="alert" className="operation-error">{t('common.invalid_date_range')}</p>}
        {!loading && !loadError && !invalidDateRange && <div className="table-container">
          <table className="industrial-table">
            <thead>
              <tr>
                <th>VENDEDOR / CAJERO</th>
                <th>CORREO</th>
                <th style={{ textAlign: 'center' }}>% COMISIÓN CONFIGURADO</th>
                <th className="numeric-cell" style={{ textAlign: 'right' }}>TOTAL VENTAS EN PERÍODO</th>
                <th className="numeric-cell" style={{ textAlign: 'right' }}>COMISIÓN A PAGAR (HNL)</th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map((u) => {
                const pct = porcentajes[u.id] ?? u.comisionPorcentaje ?? 5.0;

                // Filtrar ventas reales por usuario y rango de fechas
                const ventasFiltradasUser = ventas.filter((v) => {
                  const timestamp = v.createdAt || v.created_at;
                  if (!timestamp || !v.usuarioId) return false;
                  const fechaVenta = new Date(timestamp);
                  if (Number.isNaN(fechaVenta.getTime())) return false;
                  const fechaVentaStr = `${fechaVenta.getFullYear()}-${String(fechaVenta.getMonth() + 1).padStart(2, '0')}-${String(fechaVenta.getDate()).padStart(2, '0')}`;
                  const esFechaValida = fechaVentaStr >= fechaInicio && fechaVentaStr <= fechaFin;
                  const esMismoUsuario = v.usuarioId === u.id;

                  return esFechaValida && esMismoUsuario;
                });

                const totalVendidoPeriodo = ventasFiltradasUser.reduce((acc, v) => acc + Number(v.total || 0), 0);
                const comisionPagar = (totalVendidoPeriodo * pct) / 100;

                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 800 }}>{u.nombre}</td>
                    <td style={{ color: 'var(--color-text-muted)' }}>{u.email}</td>
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
                    <td className="numeric-cell" style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(totalVendidoPeriodo)}</td>
                    <td className="numeric-cell" style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 900, color: '#16A34A', fontSize: '15px' }}>
                      {formatLempiras(comisionPagar)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
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
