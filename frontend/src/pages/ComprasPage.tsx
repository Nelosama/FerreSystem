import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { api } from '../utils/api';
import { useI18n } from '../context/I18nContext';
import { useTenant } from '../context/TenantContext';
import { formatFechaCalendario, formatLempiras } from '../utils/format';
import { newRequestId } from '../utils/requestId';
import { costoSugerido, validarLineaCompra } from '../utils/compraCosto';
import {
  estadoRecepcion, type LineaCompra, pendienteLinea, totalesCompra, validarCompra, validarRecepcion,
} from '../utils/compras';
import './OperacionesPage.css';
import './ComprasPage.css';

const errorDeApi = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (typeof m === 'string' ? m : fallback);
};

/** Compras: proveedor → factura y productos → revisión → confirmar → recibir (total o parcial) → deuda. */
export function ComprasPage() {
  const { t } = useI18n();
  const { user } = useTenant();
  const esAdmin = user?.rol === 'ADMIN';
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [compras, setCompras] = useState<any[]>([]);
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  // Nueva compra
  const [proveedorId, setProveedorId] = useState('');
  const [factura, setFactura] = useState('');
  const [vencimiento, setVencimiento] = useState('');
  const [isv, setIsv] = useState('0');
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [lineas, setLineas] = useState<(LineaCompra & { detalleId?: string })[]>([]);
  // La misma solicitud se reenvía si la respuesta se pierde: no se registra la factura dos veces.
  const [solicitudCompra, setSolicitudCompra] = useState<string | null>(null);
  // Pago al contado (solo ADMIN): los pagos a proveedor no descuentan la caja del turno.
  const [contado, setContado] = useState(false);
  const [metodoContado, setMetodoContado] = useState('EFECTIVO');
  // Evita un segundo envío con doble clic antes de que React actualice el estado.
  const enCurso = useRef(false);

  // Recepciones
  const [ordenAbierta, setOrdenAbierta] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [solicitudesRecepcion, setSolicitudesRecepcion] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    try {
      const [prov, prod, comp] = await Promise.all([api.get('/operaciones/proveedores'), api.get('/productos'), api.get('/operaciones/compras')]);
      setProveedores(prov.data); setProductos(prod.data); setCompras(comp.data);
      if (user?.rol === 'ADMIN') setCuentas((await api.get('/operaciones/cuentas', { params: { tipo: 'CXP' } })).data);
    } catch (e) {
      setError(errorDeApi(e, t('purchase_flow.error_load')));
    } finally {
      setCargando(false);
    }
  }, [t, user?.rol]);

  useEffect(() => { void cargar(); }, [cargar]);

  const { subtotal, total } = useMemo(() => totalesCompra(lineas, Number(isv) || 0), [lineas, isv]);
  const saldoDe = (ordenId: string) => cuentas.find(c => c.documento_id === ordenId);

  const elegirProducto = (id: string) => {
    setProductoId(id);
    setCosto(esAdmin ? costoSugerido(productos.find(p => p.id === id)?.precioCosto) : '');
  };

  const agregarLinea = () => {
    setError(''); setMensaje('');
    const producto = productos.find(p => p.id === productoId);
    if (!producto) { setError(t('purchase_flow.error_product')); return; }
    if (lineas.some(l => l.productoId === producto.id)) { setError(t('purchase_flow.error_duplicate')); return; }
    const r = validarLineaCompra(cantidad, costo);
    if ('error' in r) { setError(t('purchase_flow.error_line')); return; }
    setLineas([...lineas, { productoId: producto.id, nombre: `${producto.codigo} · ${producto.nombre}`, ...r.linea }]);
    setProductoId(''); setCantidad(''); setCosto('');
  };

  const confirmarCompra = async () => {
    if (enCurso.current) return;
    setError(''); setMensaje('');
    const codigo = validarCompra({ proveedorId, factura, lineas, isv });
    if (codigo) { setError(t(`purchase_flow.error_${codigo}`)); return; }
    enCurso.current = true;
    const solicitud = solicitudCompra ?? newRequestId();
    setSolicitudCompra(solicitud); setOcupado(true);
    try {
      await api.post('/operaciones/compras', {
        solicitudId: solicitud, proveedorId, numeroFactura: factura.trim(), isv: Number(isv),
        ...(vencimiento ? { vencimiento } : {}),
        ...(contado && esAdmin ? { pagoContado: { metodo: metodoContado } } : {}),
        items: lineas.map(l => ({ productoId: l.productoId, cantidad: l.cantidad, costo: l.costo })),
      });
      setSolicitudCompra(null); setLineas([]); setFactura(''); setVencimiento(''); setIsv('0'); setProveedorId('');
      setContado(false);
      setMensaje(t('purchase_flow.saved'));
      await cargar();
    } catch (e) {
      setError(errorDeApi(e, t('purchase_flow.error_save')));
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  };

  const abrirRecepcion = (orden: any) => {
    setOrdenAbierta(ordenAbierta === orden.id ? null : orden.id);
    setError(''); setMensaje('');
    setCantidades(Object.fromEntries(orden.items.map((i: any) => [i.id, ''])));
  };

  const recibirTodo = (orden: any) => {
    setCantidades(Object.fromEntries(orden.items.map((i: any) => [i.id, String(pendienteLinea(i))])));
  };

  const confirmarRecepcion = async (orden: any) => {
    if (enCurso.current) return;
    setError(''); setMensaje('');
    const lineasRecibidas = orden.items.map((i: any) => ({
      detalleId: i.id, pedida: pendienteLinea(i), recibida: Number(cantidades[i.id] || 0),
    }));
    const codigo = validarRecepcion(lineasRecibidas);
    if (codigo) { setError(t(`purchase_flow.error_${codigo}`)); return; }
    // La recepción aumenta existencias: se confirma antes de enviarla.
    if (!window.confirm(t('purchase_flow.confirm_receipt_warning'))) return;
    enCurso.current = true;
    const solicitud = solicitudesRecepcion[orden.id] ?? newRequestId();
    setSolicitudesRecepcion({ ...solicitudesRecepcion, [orden.id]: solicitud }); setOcupado(true);
    try {
      await api.post(`/operaciones/compras/${orden.id}/recepciones`, {
        solicitudId: solicitud,
        items: lineasRecibidas.filter((l: any) => l.recibida > 0).map((l: any) => ({ detalleId: l.detalleId, cantidad: l.recibida })),
      });
      const copia = { ...solicitudesRecepcion }; delete copia[orden.id];
      setSolicitudesRecepcion(copia); setOrdenAbierta(null);
      setMensaje(t('purchase_flow.received'));
      await cargar();
    } catch (e) {
      setError(errorDeApi(e, t('purchase_flow.error_receive')));
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  };

  const pendientes = compras.filter(o => estadoRecepcion(o) !== 'RECIBIDA');

  return (
    <div className="compras-page">
      <TopBar title={t('purchase_flow.title')} subtitle={t('purchase_flow.subtitle')} />

      <form className="operation-card compras-card" onSubmit={e => { e.preventDefault(); void confirmarCompra(); }} aria-labelledby="compra-nueva">
        <h2 id="compra-nueva">{t('purchase_flow.new_purchase')}</h2>
        <div className="compras-grid">
          <label>{t('purchase_flow.supplier')}
            <select className="form-input" required value={proveedorId} onChange={e => setProveedorId(e.target.value)} disabled={ocupado}>
              <option value="">{t('purchase_flow.choose')}</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label>{t('purchase_flow.invoice')}
            <input className="form-input" required value={factura} onChange={e => setFactura(e.target.value)} disabled={ocupado} />
          </label>
          <label>{t('purchase_flow.due_date')}
            <input className="form-input" type="date" value={vencimiento} onChange={e => setVencimiento(e.target.value)} disabled={ocupado} />
          </label>
          <label>{t('purchase_flow.tax')}
            <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" value={isv} onChange={e => setIsv(e.target.value)} disabled={ocupado} />
          </label>
        </div>

        <fieldset className="compras-lineas-nuevas" disabled={ocupado}>
          <legend>{t('purchase_flow.products')}</legend>
          <div className="compras-grid">
            <label>{t('purchase_flow.product')}
              <select className="form-input" value={productoId} onChange={e => elegirProducto(e.target.value)}>
                <option value="">{t('purchase_flow.choose')}</option>
                {productos.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
              </select>
            </label>
            <label>{t('purchase_flow.quantity')}
              <input className="form-input" type="number" inputMode="decimal" min="0.01" step="0.01" value={cantidad} onChange={e => setCantidad(e.target.value)} />
            </label>
            <label>{t('purchase_flow.unit_cost')}
              <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" value={costo} onChange={e => setCosto(e.target.value)} />
            </label>
          </div>
          <button type="button" className="btn btn-secondary" onClick={agregarLinea} disabled={!productoId}>{t('purchase_flow.add_product')}</button>
        </fieldset>

        {lineas.length > 0 && (
          <div className="compras-revision" aria-label={t('purchase_flow.review')}>
            <h3>{t('purchase_flow.review')}</h3>
            <ul className="compras-items">
              {lineas.map(l => (
                <li key={l.productoId}>
                  <span className="compras-item-nombre">{l.nombre}</span>
                  <span>{l.cantidad} × {formatLempiras(l.costo)} = {formatLempiras(Math.round(l.cantidad * l.costo * 100) / 100)}</span>
                  <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => setLineas(lineas.filter(x => x.productoId !== l.productoId))}>
                    {t('purchase_flow.remove')}
                  </button>
                </li>
              ))}
            </ul>
            <p className="compras-totales">{t('purchase_flow.subtotal')} {formatLempiras(subtotal)} · {t('purchase_flow.total')} <strong>{formatLempiras(total)}</strong></p>
          </div>
        )}

        {esAdmin && (
          <fieldset className="compras-contado" disabled={ocupado}>
            <label className="compras-check"><input type="checkbox" checked={contado} onChange={e => setContado(e.target.checked)} /> {t('purchase_flow.cash_payment')}</label>
            {contado && (
              <>
                <label>{t('purchase_flow.cash_method')}
                  <select className="form-input" value={metodoContado} onChange={e => setMetodoContado(e.target.value)}>
                    <option value="EFECTIVO">{t('purchase_flow.method_cash')}</option>
                    <option value="TARJETA">{t('purchase_flow.method_card')}</option>
                    <option value="TRANSFERENCIA">{t('purchase_flow.method_transfer')}</option>
                  </select>
                </label>
                <p className="form-hint">{t('purchase_flow.cash_note')}</p>
              </>
            )}
          </fieldset>
        )}
        {error && <p role="alert" className="compras-error">{error}</p>}
        {mensaje && <p role="status" className="compras-ok">{mensaje}</p>}
        <button type="submit" className="btn btn-primary" disabled={ocupado || lineas.length === 0}>{t('purchase_flow.confirm_purchase')}</button>
      </form>

      <section className="compras-lista" aria-labelledby="compras-lista">
        <h2 id="compras-lista">{t('purchase_flow.purchases_list')}</h2>
        {cargando && <p>…</p>}
        {!cargando && compras.length === 0 && <p>{t('purchase_flow.empty')}</p>}
        {compras.map(orden => {
          const estado = estadoRecepcion(orden);
          const cuenta = saldoDe(orden.id);
          const abierta = ordenAbierta === orden.id;
          return (
            <article className="operation-card compras-card" key={orden.id}>
              <header className="compras-cabecera">
                <h3>{orden.numero_factura || orden.codigo} · {orden.proveedor_nombre}</h3>
                <span className={`badge ${estado === 'RECIBIDA' ? 'badge-success' : 'badge-warning'}`}>{t(`purchase_flow.status_${estado.toLowerCase()}`)}</span>
              </header>
              <p>{t('purchase_flow.total')}: <strong>{formatLempiras(Number(orden.total))}</strong>
                {orden.vencimiento && <> · {t('purchase_flow.due')} {formatFechaCalendario(orden.vencimiento)}</>}
                {esAdmin && cuenta && <> · {t('purchase_flow.balance')} <strong>{formatLempiras(Number(cuenta.saldo))}</strong></>}
              </p>
              {estado !== 'RECIBIDA' && (
                <button type="button" className="btn btn-primary" disabled={ocupado} aria-expanded={abierta} onClick={() => abrirRecepcion(orden)}>
                  {abierta ? t('purchase_flow.close_receipt') : t('purchase_flow.receive')}
                </button>
              )}
              {abierta && (
                <div className="compras-recepcion">
                  <ul className="compras-items">
                    {orden.items.map((i: any) => {
                      const pendiente = pendienteLinea(i);
                      return (
                        <li key={i.id}>
                          <span className="compras-item-nombre">{i.codigo} · {i.nombre}</span>
                          <span>{t('purchase_flow.pending_qty')}: {pendiente} · {t('purchase_flow.received_qty')}: {Number(i.cantidad_recibida)}</span>
                          {esAdmin && <span>{t('purchase_flow.unit_cost')}: {formatLempiras(Number(i.precio_costo))}</span>}
                          <label className="compras-cantidad">{t('purchase_flow.to_receive')}
                            <input className="form-input" type="number" inputMode="decimal" min="0" max={pendiente} step="0.01"
                              aria-label={`${t('purchase_flow.to_receive')} ${i.nombre}`} disabled={ocupado || pendiente === 0}
                              value={cantidades[i.id] ?? ''} onChange={e => setCantidades({ ...cantidades, [i.id]: e.target.value })} />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="compras-acciones">
                    <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => recibirTodo(orden)}>{t('purchase_flow.receive_all')}</button>
                    <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void confirmarRecepcion(orden)}>{t('purchase_flow.confirm_receipt')}</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {pendientes.length === 0 && compras.length > 0 && <p className="compras-vacio">{t('purchase_flow.all_received')}</p>}
      </section>
    </div>
  );
}
