import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../utils/api';
import { useTenant } from '../context/TenantContext';
import { TopBar } from '../components/TopBar';
import { ZONA_HORARIA_NEGOCIO, formatLempiras } from '../utils/format';
import './OperacionesPage.css';

interface LineaEntrega {
  detalleId: string; codigo: string; nombre: string; modoEntrega: string;
  cantidad: number; entregada: number; pendiente: number; enPoderDelCliente: number;
}
interface VentaPendiente {
  ventaId: string; numeroVenta: string | number; creadaAt: string; total: number; cliente?: string | null;
  cajero: string; antiguedadHoras: number; alerta: 'NINGUNA' | 'INFORMATIVA' | 'AVISO' | 'ESCALAMIENTO'; lineas: LineaEntrega[];
}
interface Formulario { solicitudId: string; receptor: string; cantidades: Record<string, string> }

const mensaje = (e: any) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || 'No se pudo confirmar la entrega. Revise la conexión y reintente: no se entregará dos veces.';
};
const ALERTAS: Record<string, string> = { INFORMATIVA: 'Pendiente hace horas', AVISO: 'Pendiente más de un día', ESCALAMIENTO: 'Pendiente más de 3 días: avise al administrador' };

/** Entregas pendientes: cantidades vendidas, entregadas y pendientes; entrega parcial con receptor obligatorio. */
export const EntregasPage: React.FC = () => {
  const { isReadOnly, user } = useTenant();
  const [ventas, setVentas] = useState<VentaPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, Formulario>>({});
  const [enviando, setEnviando] = useState(false);
  const enCurso = useRef(false);
  const puedeEntregar = user?.rol === 'ADMIN' || user?.rol === 'BODEGUERO';

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try { { const r = await api.get('/entregas/pendientes'); setVentas(Array.isArray(r.data?.pendientes) ? r.data.pendientes : []); } }
    catch (e) { setError(mensaje(e)); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const abrir = (v: VentaPendiente) => {
    setExito(''); setError('');
    setAbierta(v.ventaId);
    // La solicitud se crea al abrir el formulario y se conserva en los reintentos.
    setForms((f) => f[v.ventaId] ? f : { ...f, [v.ventaId]: {
      solicitudId: crypto.randomUUID(), receptor: '',
      cantidades: Object.fromEntries(v.lineas.filter((l) => l.modoEntrega === 'BODEGA' && l.pendiente > 0).map((l) => [l.detalleId, String(l.pendiente)])),
    } });
  };
  const cambiar = (id: string, parche: Partial<Formulario>) => setForms((f) => ({ ...f, [id]: { ...f[id], ...parche } }));

  const confirmar = async (v: VentaPendiente) => {
    const f = forms[v.ventaId];
    if (!f || enCurso.current || isReadOnly) return;
    const lineas = v.lineas
      .filter((l) => l.modoEntrega === 'BODEGA' && l.pendiente > 0)
      .map((l) => ({ detalleId: l.detalleId, cantidad: Number(f.cantidades[l.detalleId] || 0), pendiente: l.pendiente, nombre: l.nombre }))
      .filter((l) => l.cantidad > 0);
    if (!f.receptor.trim()) { setError('Escriba el nombre de quien recibe los productos.'); return; }
    if (!lineas.length) { setError('Indique al menos una cantidad a entregar.'); return; }
    const exceso = lineas.find((l) => l.cantidad > l.pendiente);
    if (exceso) { setError(`La cantidad de ${exceso.nombre} supera lo pendiente (${exceso.pendiente}).`); return; }
    if (lineas.some((l) => Math.abs(l.cantidad * 100 - Math.round(l.cantidad * 100)) > 1e-7)) { setError('Use como máximo dos decimales.'); return; }
    enCurso.current = true; setEnviando(true); setError(''); setExito('');
    try {
      await api.post(`/entregas/ventas/${v.ventaId}/entregas`, {
        solicitudId: f.solicitudId, receptorNombre: f.receptor.trim(),
        lineas: lineas.map(({ detalleId, cantidad }) => ({ detalleId, cantidad })),
      });
      setExito(`Entrega registrada de la venta ${v.numeroVenta}.`);
      setAbierta(null); setForms((x) => { const { [v.ventaId]: _, ...resto } = x; return resto; });
      await cargar();
    } catch (e: any) {
      // Con rechazo definitivo se descarta la solicitud; ante un fallo de red se conserva para reintentar sin duplicar.
      if ([400, 403, 404, 409, 422].includes(e?.response?.status)) cambiar(v.ventaId, { solicitudId: crypto.randomUUID() });
      setError(mensaje(e));
    } finally { enCurso.current = false; setEnviando(false); }
  };

  return <div>
    <TopBar title="ENTREGAS PENDIENTES" subtitle="Productos cobrados que aún no salen de bodega" />
    <main className="operation-page">
      {error && <p role="alert" className="operation-error">{error}</p>}
      {exito && <p role="status" className="operation-success">{exito}</p>}
      {cargando && <p>Cargando entregas…</p>}
      {!cargando && !ventas.length && !error && <p>No hay entregas pendientes.</p>}
      {ventas.map((v) => {
        const f = forms[v.ventaId];
        const abiertaAhora = abierta === v.ventaId && f;
        return <section className="operation-card" key={v.ventaId} aria-label={`Venta ${v.numeroVenta}`}>
          <h3>Venta {v.numeroVenta} · {v.cliente || 'Consumidor final'}</h3>
          <p>{new Date(v.creadaAt).toLocaleString('es-HN', { timeZone: ZONA_HORARIA_NEGOCIO })} · {formatLempiras(v.total)} · Cobró {v.cajero}</p>
          {v.alerta !== 'NINGUNA' && <p role="note"><strong>{ALERTAS[v.alerta]}</strong></p>}
          <ul>{v.lineas.filter((l) => l.modoEntrega === 'BODEGA').map((l) => <li key={l.detalleId}>
            <strong>{l.nombre}</strong> · Vendido {l.cantidad} · Entregado {l.entregada} · <strong>Pendiente {l.pendiente}</strong>
            {abiertaAhora && l.pendiente > 0 && <label style={{ display: 'block' }}>Entregar ahora
              <input type="number" inputMode="decimal" min={0} max={l.pendiente} step="0.01" value={f.cantidades[l.detalleId] ?? ''}
                onChange={(e) => cambiar(v.ventaId, { cantidades: { ...f.cantidades, [l.detalleId]: e.target.value } })} />
            </label>}
          </li>)}</ul>
          {puedeEntregar && !abiertaAhora && <button type="button" className="btn btn-primary" disabled={enviando || isReadOnly} onClick={() => abrir(v)}>Entregar</button>}
          {!puedeEntregar && <p>Solo bodega o administración puede confirmar la entrega.</p>}
          {abiertaAhora && <div>
            <label>Quien recibe
              <input type="text" maxLength={200} value={f.receptor} onChange={(e) => cambiar(v.ventaId, { receptor: e.target.value })} placeholder="Nombre de quien recibe" />
            </label>
            <button type="button" className="btn btn-primary" disabled={enviando || isReadOnly} aria-busy={enviando} onClick={() => void confirmar(v)}>Confirmar entrega</button>
            <button type="button" className="btn btn-secondary" disabled={enviando} onClick={() => setAbierta(null)}>Cancelar</button>
          </div>}
        </section>;
      })}
    </main>
  </div>;
};
