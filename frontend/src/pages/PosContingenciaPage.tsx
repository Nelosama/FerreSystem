import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { api } from '../utils/api';
import { calcularTotales, aCentavos, aCentesimas, formatearCentavos, formatearCentesimas } from '../offline/money';
import { abrirBase, almacenamientoDisponible, durabilidadDeEscritura } from '../offline/db';
import {
  cuentaPorEstado, exportarDiario, listarOperaciones, registrarOperacion, vendidoPorProducto,
  type LineaLocal, type NuevaOperacion, type OperacionLocal,
} from '../offline/journal';
import {
  borrarBorrador, guardarBorrador, identificadorDispositivo, leerBorrador, leerVentana, ventanaVigente,
  type DispositivoLocal, type ProductoVenta, type VentanaLocal,
} from '../offline/ventana';
import { registrarDispositivoEnServidor, renovarVentana, sincronizarPendientes } from '../offline/sync';
import './PosContingenciaPage.css';

// POS de contingencia en efectivo. Funciona con la página cargada aunque no haya red: el catálogo, el diario
// y el borrador viven en IndexedDB. Con conexión, renueva la ventana y envía las ventas pendientes.

const INTERVALO_SYNC_MS = 30_000;
const UMBRAL_RENOVAR_MS = 2 * 3_600_000;
const LIMITE_LINEAS = 60;

type Linea = LineaLocal & { productoIdCatalogo?: string };

const hora = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : 'nunca');

function textoEstado(op: OperacionLocal) {
  if (op.estado === 'PENDIENTE') return op.ultimoError ? `Pendiente · reintentará (${op.ultimoError})` : 'Pendiente de enviar';
  if (op.estado === 'ENVIANDO') return 'Enviando…';
  if (op.estado === 'SINCRONIZADA') return op.conflictos.length ? `Sincronizada · observación: ${op.conflictos.length}` : 'Sincronizada';
  return 'Requiere revisión del administrador';
}

export default function PosContingenciaPage() {
  const { user, tenant } = useTenant();
  const [operador, setOperador] = useState<boolean | null>(null);
  const [enLinea, setEnLinea] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [dispositivo, setDispositivo] = useState<DispositivoLocal | null>(null);
  const [ventana, setVentana] = useState<VentanaLocal | null>(null);
  const [ops, setOps] = useState<OperacionLocal[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteRtn, setClienteRtn] = useState('');
  const [efectivoTexto, setEfectivoTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmacion, setConfirmacion] = useState<OperacionLocal | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'ok' | 'aviso'; texto: string } | null>(null);
  const [ultimaSync, setUltimaSync] = useState<string | undefined>(undefined);
  const [habilitada, setHabilitada] = useState<boolean | null>(null);
  const [almacen, setAlmacen] = useState<'ok' | 'no-disponible' | 'error'>('ok');
  const guardandoRef = useRef(false);
  const enSyncRef = useRef(false);
  const borradorListo = useRef(false);

  const recargarDiario = useCallback(async () => {
    setOps(await listarOperaciones());
  }, []);

  // Pestaña operadora: solo una pestaña puede cobrar. Las demás muestran el aviso y no escriben en el diario.
  useEffect(() => {
    if (!navigator.locks) { setOperador(true); return; }
    let liberar: (() => void) | undefined;
    navigator.locks.request('ferre-pos-operador', { ifAvailable: true }, (lock) => {
      if (!lock) { setOperador(false); return undefined; }
      setOperador(true);
      return new Promise<void>((resolve) => { liberar = resolve; });
    }).catch(() => setOperador(true));
    return () => liberar?.();
  }, []);

  // Carga inicial desde el almacén local: no requiere red.
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!almacenamientoDisponible()) { setAlmacen('no-disponible'); return; }
      try {
        await abrirBase();
        const [disp, ven, borr] = await Promise.all([identificadorDispositivo(), leerVentana(), leerBorrador()]);
        if (!vivo) return;
        setDispositivo(disp);
        setVentana(ven ?? null);
        if (borr && user && borr.cajeroId === user.id && borr.lineas.length) {
          setLineas(borr.lineas);
          setClienteNombre(borr.clienteNombre);
          setClienteRtn(borr.clienteRtn);
          setEfectivoTexto(borr.efectivoTexto);
          setMensaje({ tipo: 'aviso', texto: 'Recuperamos la venta que estaba preparando. Revise los productos antes de cobrar.' });
        }
        await recargarDiario();
        borradorListo.current = true;
      } catch (error: any) {
        if (vivo) { setAlmacen('error'); setMensaje({ tipo: 'error', texto: `No se pudo abrir el almacenamiento local: ${error?.message ?? 'error desconocido'}` }); }
      }
    })();
    return () => { vivo = false; };
  }, [user, recargarDiario]);

  useEffect(() => {
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Configuración de la empresa: se lee en línea; sin red se usa la última conocida con ventana vigente.
  useEffect(() => {
    if (!enLinea) return;
    api.get('/contingencia/configuracion').then(({ data }) => setHabilitada(Boolean(data.habilitada))).catch(() => undefined);
  }, [enLinea]);

  // Registro del equipo y renovación de la ventana (solo con conexión).
  const prepararConexion = useCallback(async () => {
    if (!dispositivo || !user || !enLinea) return;
    try {
      let actual = dispositivo;
      if (!actual.registrado) actual = await registrarDispositivoEnServidor(api, actual);
      setDispositivo(actual);
      const restante = ventana ? new Date(ventana.vigenteHasta).getTime() - Date.now() : 0;
      if (user.rol !== 'ADMIN' && (!ventana || restante < UMBRAL_RENOVAR_MS || ventana.cajeroId !== user.id)) {
        const nueva = await renovarVentana(api, actual, { id: user.id, tenantId: tenant?.id });
        setVentana(nueva);
      }
      setMensaje((m) => (m?.tipo === 'error' ? null : m));
    } catch (error: any) {
      const texto = error?.response?.data?.message;
      setMensaje({ tipo: 'aviso', texto: typeof texto === 'string' ? texto : 'No se pudo preparar la contingencia. Se intentará de nuevo al volver la conexión.' });
    }
  }, [dispositivo, enLinea, user, ventana, tenant?.id]);

  useEffect(() => { void prepararConexion(); }, [prepararConexion]);

  // Envío del diario: al volver la conexión, periódicamente y tras cada venta. Un solo envío a la vez.
  const sincronizar = useCallback(async () => {
    if (!enLinea || !dispositivo?.registrado || !user || operador === false || enSyncRef.current) return;
    enSyncRef.current = true;
    try {
      const r = await sincronizarPendientes(api, dispositivo.id, { id: user.id, rol: user.rol });
      setUltimaSync(new Date().toISOString());
      if (r.error && r.enviadas === 0) setMensaje({ tipo: 'aviso', texto: r.error });
      if (r.aplicadas) setMensaje({ tipo: 'ok', texto: `${r.aplicadas} venta(s) enviadas y confirmadas por la oficina.` });
      if (r.enRevision) setMensaje({ tipo: 'error', texto: `${r.enRevision} venta(s) requieren revisión del administrador.` });
    } catch (error: any) {
      setMensaje({ tipo: 'aviso', texto: `No se pudieron enviar las ventas: ${error?.message ?? 'error'}` });
    } finally {
      enSyncRef.current = false;
      await recargarDiario();
    }
  }, [enLinea, dispositivo, user, operador, recargarDiario]);

  useEffect(() => {
    if (!enLinea) return;
    void sincronizar();
    const id = window.setInterval(() => { void sincronizar(); }, INTERVALO_SYNC_MS);
    return () => window.clearInterval(id);
  }, [enLinea, sincronizar]);

  // Borrador: se guarda al cambiar para no perderlo si el navegador se cierra.
  useEffect(() => {
    if (!borradorListo.current || !user) return;
    const id = window.setTimeout(() => {
      if (lineas.length) void guardarBorrador({ cajeroId: user.id, lineas, clienteNombre, clienteRtn, efectivoTexto, guardadoAt: new Date().toISOString() }).catch(() => undefined);
      else void borrarBorrador().catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(id);
  }, [lineas, clienteNombre, clienteRtn, efectivoTexto, user]);

  const ahora = Date.now();
  const vigente = ventanaVigente(ventana ?? undefined, ahora);
  const esCajeroDeVentana = !!user && !!ventana && ventana.cajeroId === user.id;
  const vendido = useMemo(() => (ventana ? vendidoPorProducto(ops, ventana.ventanaId) : new Map<string, number>()), [ops, ventana]);
  const contadores = useMemo(() => cuentaPorEstado(ops), [ops]);

  const disponibleLocal = (p: ProductoVenta) => {
    const enDiario = vendido.get(p.id) ?? 0;
    const enCarrito = lineas.filter((l) => l.productoId === p.id).reduce((a, l) => a + l.cantidadCentesimas, 0);
    return Math.max(0, p.cupoCentesimas - enDiario - enCarrito);
  };

  const resultados = useMemo(() => {
    if (!ventana) return [];
    const q = busqueda.trim().toLowerCase();
    const lista = ventana.productos.filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q) || (p.codigoBarras ?? '').toLowerCase() === q);
    return lista.slice(0, 60);
  }, [busqueda, ventana]);

  const totales = useMemo(() => {
    try {
      return calcularTotales(lineas.map((l) => ({ precioCentavos: l.precioCentavos, cantidadCentesimas: l.cantidadCentesimas })));
    } catch { return { lineas: [], subtotal: 0, isv: 0, total: 0 }; }
  }, [lineas]);

  const efectivoCentavos = aCentavos(efectivoTexto);
  const cambio = efectivoCentavos !== null ? efectivoCentavos - totales.total : null;

  const agregar = (p: ProductoVenta, cantidadCentesimas = 100) => {
    if (!operador) return;
    const disponible = disponibleLocal(p);
    if (cantidadCentesimas > disponible) {
      setMensaje({ tipo: 'error', texto: `No hay más ${p.nombre} disponible en contingencia (quedan ${formatearCentesimas(disponible)}).` });
      return;
    }
    if (lineas.length >= LIMITE_LINEAS && !lineas.some((l) => l.productoId === p.id)) {
      setMensaje({ tipo: 'error', texto: `Una venta admite hasta ${LIMITE_LINEAS} productos.` });
      return;
    }
    setConfirmacion(null);
    setMensaje(null);
    setLineas((actual) => {
      const existe = actual.find((l) => l.productoId === p.id);
      if (existe) return actual.map((l) => (l.productoId === p.id ? { ...l, cantidadCentesimas: l.cantidadCentesimas + cantidadCentesimas } : l));
      return [...actual, { productoId: p.id, codigo: p.codigo, nombre: p.nombre, cantidadCentesimas, precioCentavos: p.precioCentavos }];
    });
  };

  const cambiarCantidad = (productoId: string, texto: string) => {
    const producto = ventana?.productos.find((p) => p.id === productoId);
    const nuevaCant = aCentesimas(texto);
    if (!producto || nuevaCant === null) { setMensaje({ tipo: 'error', texto: 'Cantidad no válida. Use números, con hasta dos decimales.' }); return; }
    // Cada producto aparece una sola vez en la venta: el máximo es el cupo menos lo ya vendido en la ventana.
    const maximo = producto.cupoCentesimas - (vendido.get(productoId) ?? 0);
    if (nuevaCant > maximo) { setMensaje({ tipo: 'error', texto: `Máximo disponible en contingencia: ${formatearCentesimas(maximo)}.` }); return; }
    setMensaje(null);
    setLineas((actual) => actual.map((l) => (l.productoId === productoId ? { ...l, cantidadCentesimas: nuevaCant } : l)));
  };

  const quitar = (productoId: string) => setLineas((actual) => actual.filter((l) => l.productoId !== productoId));

  const nuevaVenta = () => {
    setLineas([]); setClienteNombre(''); setClienteRtn(''); setEfectivoTexto(''); setConfirmacion(null); setMensaje(null);
    void borrarBorrador().catch(() => undefined);
  };

  const motivoBloqueo = (): string | null => {
    if (!habilitada && habilitada !== null) return 'La contingencia no está activada para esta empresa.';
    if (operador === false) return 'Este POS está abierto en otra pestaña. Cobre desde esa pestaña.';
    if (!ventana) {
      if (!enLinea) return 'Sin ventana de contingencia en este equipo. Conéctese a internet una vez para prepararla.';
      if (dispositivo && !dispositivo.registrado) return 'Este equipo no está registrado para contingencia. Vea el aviso o pida al administrador revisar las cajas de contingencia.';
      return 'Preparando la contingencia…';
    }
    if (!esCajeroDeVentana) return 'La ventana de contingencia pertenece a otro cajero. Inicie sesión con ese usuario.';
    if (!vigente) return 'La ventana de contingencia venció. Conéctese a internet para renovarla.';
    if (!lineas.length) return 'Agregue productos para cobrar.';
    if (efectivoCentavos === null) return 'Escriba el efectivo recibido.';
    if (efectivoCentavos < totales.total) return `Falta ${formatearCentavos(totales.total - efectivoCentavos)} para cubrir la venta.`;
    if (ventana.limites.montoMaxVentaCentavos && totales.total > ventana.limites.montoMaxVentaCentavos) {
      return `La venta supera el límite de contingencia de ${formatearCentavos(ventana.limites.montoMaxVentaCentavos)}.`;
    }
    if (almacen !== 'ok') return 'No hay almacenamiento local disponible. No se puede cobrar sin conservar la venta.';
    return null;
  };

  const cobrar = async () => {
    if (guardandoRef.current) return;
    const bloqueo = motivoBloqueo();
    if (bloqueo) { setMensaje({ tipo: 'error', texto: bloqueo }); return; }
    if (!ventana || !dispositivo || !user || efectivoCentavos === null) return;
    guardandoRef.current = true;
    setGuardando(true);
    const nueva: NuevaOperacion = {
      operacionId: crypto.randomUUID(), dispositivoId: dispositivo.id, ventanaId: ventana.ventanaId, cajeroId: user.id,
      cajeroNombre: user.nombre, cajaId: ventana.cajaId, ocurridoAtLocal: new Date().toISOString(),
      lineas: lineas.map(({ productoIdCatalogo: _ignorar, ...l }) => l),
      subtotalCentavos: totales.subtotal, isvCentavos: totales.isv, totalCentavos: totales.total,
      efectivoRecibidoCentavos: efectivoCentavos, cambioCentavos: efectivoCentavos - totales.total,
      clienteNombre: clienteNombre.trim(), clienteRtn: clienteRtn.trim(), esquemaVersion: 1,
    };
    try {
      const guardada = await registrarOperacion(nueva, dispositivo.codigo);
      setConfirmacion(guardada);
      setLineas([]); setClienteNombre(''); setClienteRtn(''); setEfectivoTexto('');
      setMensaje({ tipo: 'ok', texto: `Venta guardada en este equipo: ${guardada.correlativoLocal}. Entregue el cambio y la mercancía.` });
      await recargarDiario();
      void borrarBorrador().catch(() => undefined);
      if (enLinea) void sincronizar();
    } catch (error: any) {
      // Sin confirmación no hay venta: el cajero no entrega mercancía ni cierra el cobro.
      setMensaje({
        tipo: 'error',
        texto: `La venta NO se guardó en este equipo (${error?.name === 'QuotaExceededError' ? 'espacio lleno' : error?.message ?? 'error local'}). No entregue la mercancía. Avise al administrador.`,
      });
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  const descargarDiario = async () => {
    const texto = await exportarDiario();
    const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `diario-contingencia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!user) return <Navigate to="/login" replace />;

  const bloqueo = motivoBloqueo();
  const puedeCobrar = !bloqueo && !guardando;

  return (
    <div className="pc-root" data-durabilidad={durabilidadDeEscritura()}>
      <header className="pc-header">
        <div>
          <h1>Caja · modo contingencia (efectivo)</h1>
          <div className="pc-meta">{tenant?.nombreComercial ?? ''} · {user.nombre} · {dispositivo?.nombre ?? ''} {dispositivo?.codigo ? `(${dispositivo.codigo})` : ''}</div>
        </div>
        <div className="pc-meta">
          <span className={`pc-estado ${enLinea ? 'en-linea' : 'sin-linea'}`} role="status" aria-live="polite">
            {enLinea ? '● En línea' : '● Sin conexión'}
          </span>
        </div>
        <div className="pc-meta">
          Ventas pendientes: <strong>{contadores.pendientes}</strong> · Revisión: <strong>{contadores.revision}</strong> · Enviadas: {contadores.sincronizadas}
          <br />Última sincronización: {hora(ultimaSync)}
          {ventana && <><br />Catálogo del {hora(ventana.sincronizadaAt)} · ventana hasta {new Date(ventana.vigenteHasta).toLocaleString('es-HN')}</>}
        </div>
      </header>

      {!enLinea && (
        <div className="pc-aviso" role="status">
          Sin conexión: puede seguir vendiendo en efectivo. Las ventas quedan guardadas en este equipo y se envían al volver internet.
          Crédito, tarjeta, transferencia, devoluciones y cambios de precio requieren conexión.
        </div>
      )}
      {bloqueo && <div className="pc-aviso error" role="alert">{bloqueo}</div>}
      {mensaje && <div className={`pc-aviso ${mensaje.tipo === 'error' ? 'error' : mensaje.tipo === 'ok' ? 'ok' : ''}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>{mensaje.texto}</div>}

      <div className="pc-grid">
        <section className="pc-panel" aria-label="Buscar productos">
          <h2>1. Buscar productos</h2>
          <input
            className="pc-buscar"
            type="search"
            placeholder="Nombre o código"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !ventana) return;
              const exacto = ventana.productos.find((p) => p.codigo.toLowerCase() === busqueda.trim().toLowerCase() || (p.codigoBarras ?? '') === busqueda.trim());
              if (exacto) { agregar(exacto); setBusqueda(''); }
            }}
            disabled={!ventana || operador === false}
            aria-label="Buscar producto por nombre o código"
          />
          <div className="pc-resultados">
            {resultados.map((p) => {
              const disp = disponibleLocal(p);
              return (
                <button key={p.id} className="pc-producto" onClick={() => agregar(p)} disabled={!operador || disp < 100 || !vigente || !esCajeroDeVentana}>
                  <strong>{p.nombre}</strong>
                  <span>{p.codigo}</span>
                  <span>Disponible: {formatearCentesimas(disp)} {p.unidadMedida.toLowerCase()}</span>
                  <div className="pc-precio">{formatearCentavos(p.precioCentavos)}</div>
                </button>
              );
            })}
            {ventana && !resultados.length && <p>No hay productos con ese texto en el catálogo de contingencia.</p>}
          </div>
        </section>

        <section className="pc-panel" aria-label="Venta actual">
          <h2>2. Venta</h2>
          {lineas.length === 0 ? <p>Sin productos. Toque un producto para agregarlo.</p> : (
            <table className="pc-tabla">
              <thead><tr><th>Producto</th><th>Cant.</th><th>Subtotal</th><th /></tr></thead>
              <tbody>
                {totales.lineas.map((sub, i) => {
                  const l = lineas[i];
                  return (
                    <tr key={l.productoId}>
                      <td>{l.nombre}<br /><small>{formatearCentavos(l.precioCentavos)} c/u</small></td>
                      <td>
                        <div className="pc-cant">
                          <button className="pc-btn" aria-label={`Quitar una unidad de ${l.nombre}`} onClick={() => cambiarCantidad(l.productoId, formatearCentesimas(Math.max(0, l.cantidadCentesimas - 100)))} disabled={guardando}>−</button>
                          <input aria-label={`Cantidad de ${l.nombre}`} defaultValue={formatearCentesimas(l.cantidadCentesimas)} key={l.cantidadCentesimas} onBlur={(e) => cambiarCantidad(l.productoId, e.target.value)} disabled={guardando} />
                          <button className="pc-btn" aria-label={`Agregar una unidad de ${l.nombre}`} onClick={() => agregar(ventana!.productos.find((p) => p.id === l.productoId)!)} disabled={guardando}>+</button>
                        </div>
                      </td>
                      <td>{formatearCentavos(sub)}</td>
                      <td><button className="pc-btn secundario" onClick={() => quitar(l.productoId)} disabled={guardando}>Quitar</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="pc-totales">
            <span>Subtotal</span><span>{formatearCentavos(totales.subtotal)}</span>
            <span>ISV 15 %</span><span>{formatearCentavos(totales.isv)}</span>
            <span className="total">Total</span><span className="total">{formatearCentavos(totales.total)}</span>
          </div>

          <div className="pc-campo">
            <label htmlFor="pc-nombre">Cliente (opcional)</label>
            <input id="pc-nombre" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} maxLength={200} placeholder="Consumidor final" disabled={guardando} />
          </div>
          <div className="pc-campo">
            <label htmlFor="pc-rtn">RTN (opcional)</label>
            <input id="pc-rtn" value={clienteRtn} onChange={(e) => setClienteRtn(e.target.value)} maxLength={100} disabled={guardando} />
          </div>
          <div className="pc-campo">
            <label htmlFor="pc-efectivo">Efectivo recibido</label>
            <input id="pc-efectivo" inputMode="decimal" value={efectivoTexto} onChange={(e) => setEfectivoTexto(e.target.value)} placeholder="0.00" disabled={guardando} />
            {cambio !== null && cambio >= 0 && <div className="pc-cambio">Cambio: {formatearCentavos(cambio)}</div>}
            {cambio !== null && cambio < 0 && <div className="pc-cambio" style={{ color: '#b91c1c' }}>Falta {formatearCentavos(-cambio)}</div>}
          </div>

          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            <button id="pc-cobrar" className="pc-btn primario" onClick={cobrar} disabled={!puedeCobrar} aria-describedby={bloqueo ? 'pc-motivo' : undefined}>
              {guardando ? 'Guardando…' : 'COBRAR EN EFECTIVO'}
            </button>
            {bloqueo && <small id="pc-motivo">{bloqueo}</small>}
            <button className="pc-btn secundario" onClick={nuevaVenta} disabled={guardando || (!lineas.length && !efectivoTexto)}>Cancelar esta venta</button>
          </div>

          {confirmacion && (
            <div className="pc-confirmacion" style={{ marginTop: 14 }}>
              <strong>Venta guardada en este equipo: {confirmacion.correlativoLocal}</strong>
              <div>Total {formatearCentavos(confirmacion.totalCentavos)} · Recibido {formatearCentavos(confirmacion.efectivoRecibidoCentavos)} · Cambio {formatearCentavos(confirmacion.cambioCentavos)}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="pc-btn" onClick={() => window.print()}>Imprimir comprobante</button>
                <button className="pc-btn primario" style={{ fontSize: 16, minHeight: 44, width: 'auto' }} onClick={() => { setConfirmacion(null); setMensaje(null); }}>Siguiente cliente</button>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="pc-panel" style={{ margin: '0 16px 16px' }} aria-label="Ventas de este equipo">
        <h2>Ventas guardadas en este equipo</h2>
        {ops.length === 0 ? <p>Todavía no hay ventas de contingencia en este equipo.</p> : (
          <ul className="pc-pendientes">
            {ops.slice(-12).reverse().map((op) => (
              <li key={op.operacionId}>
                <strong>{op.correlativoLocal}</strong> · {formatearCentavos(op.totalCentavos)} · {new Date(op.creadaAt).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })} · {textoEstado(op)}
                {op.correlativoDefinitivo && <> · Central: {op.correlativoDefinitivo}</>}
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button className="pc-btn" onClick={descargarDiario}>Exportar diario (respaldo)</button>
          {enLinea && dispositivo?.registrado && <button className="pc-btn" onClick={() => void sincronizar()} disabled={operador === false}>Enviar pendientes ahora</button>}
        </div>
        {operador === false && <p role="status">Esta pestaña no cobra porque otra pestaña del POS ya está activa.</p>}
      </section>

      <div className="pc-comprobante" aria-hidden="true">
        {confirmacion && (
          <div>
            <strong>COMPROBANTE INTERNO DE CONTINGENCIA</strong><br />
            NO ES FACTURA FISCAL<br />
            {tenant?.nombreComercial}<br />
            Ref. local: {confirmacion.correlativoLocal}<br />
            Fecha: {new Date(confirmacion.creadaAt).toLocaleString('es-HN')}<br />
            Cajero: {confirmacion.cajeroNombre}<br />
            Cliente: {confirmacion.clienteNombre || 'Consumidor final'}<br />
            {confirmacion.lineas.map((l) => (
              <div key={l.productoId}>{l.nombre} {formatearCentesimas(l.cantidadCentesimas)} x {formatearCentavos(l.precioCentavos)}</div>
            ))}
            Subtotal: {formatearCentavos(confirmacion.subtotalCentavos)}<br />
            ISV 15%: {formatearCentavos(confirmacion.isvCentavos)}<br />
            TOTAL: {formatearCentavos(confirmacion.totalCentavos)}<br />
            Efectivo: {formatearCentavos(confirmacion.efectivoRecibidoCentavos)}<br />
            Cambio: {formatearCentavos(confirmacion.cambioCentavos)}<br />
          </div>
        )}
      </div>
    </div>
  );
}
