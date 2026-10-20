import { calcularVentaPOS } from '../utils/posMoney';
import { buscarPorCodigo, filtrarCatalogo, indexarCatalogo } from '../utils/posCatalogo';
import { Link } from 'react-router-dom';
import { ClientePicker, type ClienteSeleccionable } from '../components/ClientePicker';
import { useEstadoCaja } from '../hooks/useEstadoCaja';
import './POSPage.css';
import { BarcodeScanner } from '../components/BarcodeScanner';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import type { ProductItem } from '../types';
import { api } from '../utils/api';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { readRecovery, saveDraft, type PendingSale, type CartItem } from '../utils/posRecovery';
import { useI18n } from '../context/I18nContext';
import {
  Search,
  ShieldAlert,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  Receipt,
  User,
  Printer,
  X,
  Loader2,
  Percent,
  Download,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  CalendarClock,
  ChevronUp,
} from 'lucide-react';
import { ZONA_HORARIA_NEGOCIO, formatLempiras } from '../utils/format';
import { descargarReciboPDF, precargarGeneradorPDF } from '../components/descargarRecibo';
import { LogotipoNegocio } from '../components/LogotipoNegocio';
import { anchoTicketCss, tamanoPaginaImpresion } from '../utils/formatoImpresion';

// Autorización bancaria de tarjeta/transferencia: la registra el cajero tras la aprobación del POS físico.
const pagoElectronicoDesde = (metodo: string, aut: { referencia: string; terminal: string }) =>
  (metodo === 'TARJETA' || metodo === 'TRANSFERENCIA') ? { referencia: aut.referencia.trim(), terminal: aut.terminal.trim() } : undefined;

// Tarjetas del catálogo pintadas a la vez: con catálogos grandes la búsqueda acota y «Mostrar más» amplía.
const TARJETAS_POR_PAGINA = 120;

// Adapta un producto del catálogo comercial al formato del POS.
const mapearProductoPOS = (p: any): ProductItem => ({
  id: p.id,
  codigo: p.codigo,
  codigoBarras:p.codigoBarras,
  codigoFabricante:p.codigoFabricante,
  nombre: p.nombre,
  descripcion: p.descripcion,
  categoria: p.categoria?.nombre || p.categoria || 'General',
  precioVenta: Number(p.precioVenta),
  precioCosto: Number(p.precioCosto||0),
  imagenUrl:p.imagenUrl,
  stockActual: Number(p.stockActual),
  stockMinimo: Number(p.stockMinimo),
  unidadMedida: p.unidadMedida || 'UNIDAD',
  usaMedida: Boolean(p.usaMedida),
  activo: Boolean(p.activo),
  stockBajo: p.stockBajo ?? (Number(p.stockActual) <= Number(p.stockMinimo)),
});

/** Encabezado de paso del ticket: «1 · Cliente», «2 · Productos», «3 · Pago y entrega». Solo presentación. */
function PasoTicket({ numero, titulo, derecha }: { numero: number; titulo: string; derecha?: string }) {
  return <div className="pos-paso"><h2><b>{numero}</b> · {titulo}</h2>{derecha && <small>{derecha}</small>}</div>;
}

// Métodos de pago: el valor enviado al servidor no cambia; solo se muestra traducido y con icono.
const METODOS_PAGO = [
  { valor: 'EFECTIVO', etiqueta: 'pos.cash', Icono: Banknote },
  { valor: 'TARJETA', etiqueta: 'pos.card', Icono: CreditCard },
  { valor: 'TRANSFERENCIA', etiqueta: 'pos.transfer', Icono: ArrowLeftRight },
  { valor: 'CREDITO', etiqueta: 'pos.credit', Icono: CalendarClock },
] as const;
const ETIQUETA_METODO: Record<string, string> = { EFECTIVO: 'pos.cash', TARJETA: 'pos.card', TRANSFERENCIA: 'pos.transfer', CREDITO: 'pos.credit' };

// Atajos del POS. Solo F2 y F8: no tienen función propia en Chrome, Edge, Firefox ni Safari
// (F1 ayuda, F3 buscar, F4 barra de direcciones en Edge, F5 recargar, F6 dirección, F7 navegación con cursor,
// F9 lector inmersivo en Edge y lectura en Firefox, F10 menú, F11 pantalla completa, F12 herramientas).
// F8 lleva el foco a «Procesar Venta» y Enter confirma: ninguna tecla registra una venta por sí sola.
const ATAJO_BUSCAR = 'F2';
const ATAJO_COBRAR = 'F8';

export const POSPage: React.FC = () => {
  const { tenant, user } = useTenant();
  const puedeEntregar = user?.rol === 'ADMIN' || user?.rol === 'BODEGUERO';
  const { t, locale } = useI18n();
  const pendingKey = `ferre_pending_sale:${tenant.id}:${user?.id || ''}`;
  const activeKey = useRef(pendingKey);
  activeKey.current = pendingKey;
  const draftKey = `ferre_sale_draft:${tenant.id}:${user?.id || ''}`;
  const initialRecovery = useRef(readRecovery(pendingKey, draftKey));
  const initialSale = initialRecovery.current.pending || initialRecovery.current.draft;
  const [loadedKey, setLoadedKey] = useState(pendingKey);
  const [storageError, setStorageError] = useState<string | null>(initialRecovery.current.error);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [borradorRecuperado, setBorradorRecuperado] = useState(!!initialRecovery.current.draft);
  const [ventaPendiente, setVentaPendiente] = useState<PendingSale | null>(initialRecovery.current.pending);
  const pendingIdentityRef = useRef(initialRecovery.current.pending?.solicitudId ?? null);
  const receiptRecoveryRef = useRef<{ pendingKey: string; draftKey: string; solicitudId: string; draft: string | null } | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<'SIN_COMPROBAR' | 'NO_REGISTRADA'>('SIN_COMPROBAR');
  const [comprobando, setComprobando] = useState(false);
  const [corrigiendoPendiente, setCorrigiendoPendiente] = useState(false);
  const comprobandoRef = useRef(false);

  const [productos, setProductos] = useState<ProductItem[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  // Advertencia de existencia: visible, pero no bloquea el pedido especial autorizado.
  const [avisoExistencia, setAvisoExistencia] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>(initialSale?.cart || []);
  const [search, setSearch] = useState('');
  const [clienteNombre, setClienteNombre] = useState(initialSale?.clienteNombre || 'Consumidor Final');
  const [clienteRtn, setClienteRtn] = useState(initialSale?.clienteRtn || '');
  const [clienteId,setClienteId]=useState<string|undefined>(initialSale?.clienteId);
  const [vencimiento,setVencimiento]=useState(initialSale?.vencimiento||'');
  const [providers,setProviders]=useState<any[]>([]);
  const [special,setSpecial]=useState(!!initialSale?.cart[0]?.sinInventario);
  const [specialProvider,setSpecialProvider]=useState(initialSale?.cart[0]?.proveedorId || '');
  // Catálogo: se refresca solo cada 60 s. Solo reemplaza la lista de productos; no cambia precios del carrito
  // (eso sigue siendo una acción explícita del cajero) ni muestra errores sobre una venta en curso.
  useAutoRefresh<ProductItem[]>({
    load: signal => api.get('/productos/comercial', { signal }).then(r => r.data.map(mapearProductoPOS)),
    apply: data => setProductos(data),
    intervalMs: 60_000,
    immediate: false,
    deps: [tenant.id, user?.id],
  });
  // Estado real de la caja compartido con la barra superior: si no se puede comprobar, NO se afirma que esté cerrada.
  const caja = useEstadoCaja();
  const estadoCajaVisible = !caja || caja.estado === 'sin_verificar' ? 'desconocida' : caja.estado;
  const syncCaja = { phase: caja?.fase ?? 'loading' };
  useEffect(()=>{let alive=true;setProviders([]);api.get('/operaciones/proveedores').then(r=>{if(alive)setProviders(r.data);}).catch(()=>{});return()=>{alive=false;};},[tenant.id,user?.id]);
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'CREDITO' | 'TRANSFERENCIA'>(initialSale?.metodoPago || 'EFECTIVO');
  const [autorizacionBancaria, setAutorizacionBancaria] = useState({ referencia: '', terminal: '' });
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState<number>(initialSale?.descuentoPorcentaje || 0);
  const cobrandoRef = useRef(false);
  const [procesandoVenta, setProcesandoVenta] = useState(false);
  const [modalTicket, setModalTicket] = useState(false);
  const [numeroVentaGenerado, setNumeroVentaGenerado] = useState<number | null>(null);
  const [ventaRegistrada, setVentaRegistrada] = useState<any>(null);
  const edicionBloqueada = procesandoVenta || comprobando || (!!ventaPendiente && !corrigiendoPendiente) || modalTicket || !!storageError || loadedKey !== pendingKey;
  // Cliente plegado: la mayoría de ventas son a consumidor final. Crédito exige un cliente registrado, así que se abre.
  const [clienteAbierto, setClienteAbierto] = useState(false);
  const clienteVisible = clienteAbierto || (metodoPago === 'CREDITO' && !clienteId);
  const buscarRef = useRef<HTMLInputElement>(null);
  const cobrarRef = useRef<HTMLButtonElement>(null);
  const pieTicketRef = useRef<HTMLDivElement>(null);
  const modalAbiertoRef = useRef(modalTicket);
  modalAbiertoRef.current = modalTicket;

  useEffect(() => {
    const alPulsar = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.isComposing || modalAbiertoRef.current) return;
      if (event.key === ATAJO_BUSCAR) {
        event.preventDefault();
        buscarRef.current?.focus();
        buscarRef.current?.select();
      } else if (event.key === ATAJO_COBRAR) {
        event.preventDefault();
        cobrarRef.current?.scrollIntoView({ block: 'nearest' });
        cobrarRef.current?.focus();
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);

  // Altura del ticket según su posición en pantalla: el pie (total, método y cobro) siempre queda visible,
  // también antes de desplazar la página. En el teléfono el CSS anula este límite.
  const ticketRef = useRef<HTMLDivElement>(null);
  const contenidoRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const ticket = ticketRef.current;
    if (!ticket) return;
    let cuadro = 0;
    const ajustar = () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => {
        const arriba = Math.max(16, ticket.getBoundingClientRect().top);
        ticket.style.setProperty('--pos-ticket-alto', `${Math.max(360, Math.floor(window.innerHeight - arriba - 16))}px`);
      });
    };
    ajustar();
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(ajustar);
    if (contenidoRef.current) observador?.observe(contenidoRef.current);
    window.addEventListener('scroll', ajustar, { passive: true });
    window.addEventListener('resize', ajustar);
    return () => {
      cancelAnimationFrame(cuadro);
      observador?.disconnect();
      window.removeEventListener('scroll', ajustar);
      window.removeEventListener('resize', ajustar);
    };
  }, []);

  const restoreRecovery = () => {
    const recovery = readRecovery(pendingKey, draftKey);
    const sale = recovery.pending || recovery.draft;
    pendingIdentityRef.current = recovery.pending?.solicitudId ?? null;
    receiptRecoveryRef.current = null;
    setVentaPendiente(recovery.pending);
    setStorageError(recovery.error);
    setDraftError(null);
    setBorradorRecuperado(!!recovery.draft);
    setRecoveryStatus('SIN_COMPROBAR');
    setCorrigiendoPendiente(false);
    setCart(sale?.cart || []);
    setClienteNombre(sale?.clienteNombre || 'Consumidor Final');
    setClienteRtn(sale?.clienteRtn || '');
    setClienteId(sale?.clienteId);
    setVencimiento(sale?.vencimiento || '');
    setMetodoPago(sale?.metodoPago || 'EFECTIVO');
    setDescuentoPorcentaje(sale?.descuentoPorcentaje || 0);
    setSpecial(!!sale?.cart[0]?.sinInventario);
    setSpecialProvider(sale?.cart[0]?.proveedorId || '');
    setModalTicket(false);
    setVentaRegistrada(null);
    setComprobando(false);
    setProcesandoVenta(false);
    setLoadedKey(pendingKey);
  };

  const isCurrentPending = (requestKey: string, solicitudId: string) => {
    if (activeKey.current !== requestKey || pendingIdentityRef.current !== solicitudId) return false;
    const recovery = readRecovery(requestKey, draftKey);
    // Un pendiente cerrado por otra pestaña conserva su identidad al reintentar;
    // una solicitud distinta no puede recibir el resultado de esta petición.
    return !recovery.error && (!recovery.pending || recovery.pending.solicitudId === solicitudId);
  };

  useEffect(() => {
    restoreRecovery();
    const changed = (event: StorageEvent) => {
      if (event.key === pendingKey || event.key === draftKey || event.key === null) restoreRecovery();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [pendingKey, draftKey]);

  useEffect(() => {
    if (loadedKey !== pendingKey || (ventaPendiente && !corrigiendoPendiente) || modalTicket || storageError) return;
    try {
      const sale = { cart, clienteNombre, clienteRtn, clienteId, vencimiento, metodoPago, descuentoPorcentaje };
      if (ventaPendiente) {
        if (!cart.length) {
          setDraftError('La venta pendiente debe conservar al menos un producto. Agregue el producto correcto para continuar.');
          return;
        }
        localStorage.setItem(pendingKey, JSON.stringify({ ...sale, solicitudId: ventaPendiente.solicitudId }));
      } else saveDraft(draftKey, sale);
      setDraftError(null);
    } catch {
      setDraftError('No se pudo guardar el borrador en este equipo. No cierre la pantalla; pida ayuda antes de continuar.');
    }
  }, [loadedKey, pendingKey, draftKey, cart, clienteNombre, clienteRtn, clienteId, vencimiento, metodoPago, descuentoPorcentaje, ventaPendiente, corrigiendoPendiente, modalTicket, storageError]);

  // F-02: el catálogo del POS solo trae lo vendible; si el código no está, el servidor dice si no existe o si no está autorizado (sin costos).
  const explicarCodigoNoVendible = useCallback(async (codigo: string) => {
    const requestKey = activeKey.current;
    try {
      const { data } = await api.get('/productos/comercial/estado', { params: { codigo } });
      if (requestKey !== activeKey.current) return;
      setErrorText(data?.mensaje || 'Código no encontrado. Revise el código o busque por descripción.');
    } catch {
      if (requestKey !== activeKey.current) return;
      setErrorText('Este código no está en el catálogo de venta. Busque por descripción o consulte al administrador.');
    }
  }, []);

  const fetchProductos = useCallback(async () => {
    const requestKey=activeKey.current;
    setErrorText(null);
    try {
      const response = await api.get('/productos/comercial');
      if(requestKey!==activeKey.current)return;
      const data = response.data.map(mapearProductoPOS);
      setProductos(data);
      return data;
    } catch (err: any) {
      if(requestKey!==activeKey.current)return;
      console.error('Error al cargar productos en POS:', err);
      const status = err.response?.status;
      setErrorText(status === 403
        ? 'Tu sesión no tiene acceso al inventario de esta empresa. Vuelve a iniciar sesión o revisa sus módulos habilitados.'
        : status === 401
          ? 'La sesión expiró. Vuelve a iniciar sesión para cargar los productos.'
          : status >= 500
            ? 'El servidor no pudo cargar los productos. Intenta nuevamente en unos momentos.'
            : 'No se pudo conectar con la API de productos. Revisa la conexión e intenta nuevamente.');
    }
  }, []);

  useEffect(() => {
    setProductos([]);fetchProductos();
  }, [fetchProductos,pendingKey]);

  const descuentoMaximoPermitido = user?.rol==='ADMIN'?100:Number(user?.descuentoMaximo??0);

  // Cálculos fiscales hondureños con descuento
  const totalesCentavos = calcularVentaPOS(cart, descuentoPorcentaje);
  const subtotalBruto = totalesCentavos.subtotal / 100;
  const esDescuentoExcedido = descuentoPorcentaje > descuentoMaximoPermitido;
  const montoDescuento = totalesCentavos.descuento / 100;
  const isv = totalesCentavos.isv / 100;
  const total = totalesCentavos.total / 100;

  const agregarAlCarrito = (prod: ProductItem) => {
    if (edicionBloqueada || cobrandoRef.current) return;
    if(special&&!specialProvider){setErrorText('Seleccione proveedor para venta sin inventario');return;}
    const existe = cart.find((i) => i.productoId === prod.id);
    const cantidadEnCarrito = existe?.cantidad ?? 0;
    if (!special && Number(prod.stockActual) < cantidadEnCarrito + 1) {
      setAvisoExistencia(`Sin existencia suficiente de ${prod.nombre}: disponibles ${prod.stockActual}. Revise la cantidad o registre un pedido especial autorizado.`);
    } else {
      setAvisoExistencia(null);
    }
    if (existe) {
      setCart(
        cart.map((i) =>
          i.productoId === prod.id ? { ...i, cantidad: i.cantidad + 1 } : i,
        ),
      );
    } else {
      setCart([
        ...cart,
        {
          productoId: prod.id,
          codigo: prod.codigo,
          nombre: prod.nombre,
          precioUnitario: prod.precioVenta,
          cantidad: 1,
          sinInventario:special,
          proveedorId:special?specialProvider:undefined,
        },
      ]);
    }
  };

  // Las tarjetas del catálogo se memorizan: escribir en el carrito o en el cliente no vuelve a pintarlas.
  // El clic usa siempre la versión vigente de agregarAlCarrito (carrito, bloqueo y proveedor actuales).
  const agregarRef = useRef(agregarAlCarrito);
  agregarRef.current = agregarAlCarrito;
  const indiceCatalogo = useMemo(() => indexarCatalogo(productos), [productos]);
  const catalogoFiltrado = useMemo(() => filtrarCatalogo(indiceCatalogo, search), [indiceCatalogo, search]);
  // Cada cambio de búsqueda (también volver a vacío) reinicia la lista a la primera página.
  const [limiteCatalogo, setLimiteCatalogo] = useState(TARJETAS_POR_PAGINA);
  const [busquedaPaginada, setBusquedaPaginada] = useState(search);
  if (busquedaPaginada !== search) {
    setBusquedaPaginada(search);
    setLimiteCatalogo(TARJETAS_POR_PAGINA);
  }
  const tarjetasCatalogo = useMemo(() => catalogoFiltrado.slice(0, limiteCatalogo).map((prod) => (
    <button
      type="button"
      key={prod.id}
      className="industrial-card pos-producto"
      style={styles.productCard}
      onClick={() => agregarRef.current(prod)}
    >
      <span style={styles.skuBadge}>{prod.codigo}</span>
      <span style={styles.productName}>{prod.nombre}</span>
      <span style={styles.priceRow}>
        <span style={styles.priceText}>{formatLempiras(prod.precioVenta)}</span>
        {prod.imagenUrl&&<img src={prod.imagenUrl} alt="" loading="lazy" referrerPolicy="no-referrer" style={{width:80,height:60,objectFit:'contain'}}/>}<span style={{ ...styles.stockText, ...(Number(prod.stockActual) <= 0 ? { color: '#B45309', fontWeight: 700 } : {}) }}>{prod.stockActual} {t('pos.available')}{Number(prod.stockActual) <= 0 ? ' · sin existencia' : ''}</span>
      </span>
    </button>
  )), [catalogoFiltrado, limiteCatalogo, t]);

  const modificarCantidad = (productoId: string, delta: number) => {
    if (edicionBloqueada || cobrandoRef.current) return;
    setCart(
      cart
        .map((i) => {
          if (i.productoId === productoId) {
            const nueva = i.cantidad + delta;
            return nueva > 0 ? { ...i, cantidad: nueva } : null;
          }
          return i;
        })
        .filter(Boolean) as CartItem[],
    );
  };

  const eliminarDelCarrito = (productoId: string) => {
    if (edicionBloqueada || cobrandoRef.current) return;
    setCart(cart.filter((i) => i.productoId !== productoId));
  };

  const mostrarVenta = (venta: any, solicitudId: string) => {
    receiptRecoveryRef.current = { pendingKey, draftKey, solicitudId, draft: localStorage.getItem(draftKey) };
    setAutorizacionBancaria({ referencia: '', terminal: '' });
    setCorrigiendoPendiente(false);
    setVentaRegistrada(venta);
    setCart(venta.detalles.map((d: any) => ({
      productoId: d.productoId, nombre: d.productoNombre, codigo: d.productoCodigo,
      cantidad: Number(d.cantidad), precioUnitario: Number(d.precioUnitario),
    })));
    setClienteNombre(venta.clienteNombre || venta.cliente?.nombre || 'Consumidor Final');
    setClienteRtn(venta.clienteRtn || venta.cliente?.rtn || '');
    setMetodoPago(venta.metodoPago);
    setNumeroVentaGenerado(venta.numeroVenta);
    setModalTicket(true);
  };

  const comprobarVenta = async () => {
    if (!ventaPendiente || comprobandoRef.current || cobrandoRef.current) return;
    const requestKey = pendingKey;
    const solicitudId = ventaPendiente.solicitudId;
    comprobandoRef.current = true;
    setComprobando(true);
    setErrorText(null);
    try {
      const { data } = await api.get(`/ventas/solicitudes/${solicitudId}`);
      if (!isCurrentPending(requestKey, solicitudId)) return;
      if (data.estado === 'REGISTRADA') mostrarVenta(data.venta, solicitudId);
      else if (data.estado === 'NO_REGISTRADA') setRecoveryStatus('NO_REGISTRADA');
      else throw new Error('Estado inesperado');
    } catch {
      if (isCurrentPending(requestKey, solicitudId)) {
        setRecoveryStatus('SIN_COMPROBAR');
        setErrorText('No pudimos comprobar la venta. Revise la conexión o vuelva a iniciar sesión. No cobre nuevamente hasta comprobarla.');
      }
    } finally {
      comprobandoRef.current = false;
      if (activeKey.current === requestKey) setComprobando(false);
    }
  };

  // onClick={handleCobrar} entrega un evento: solo el valor 'BODEGA' cambia el modo (por defecto, entrega en mostrador).
  const handleCobrar = async (modo?: unknown) => {
    // La entrega inmediata es una entrega física: solo ADMIN y BODEGUERO. Los demás roles cobran para bodega.
    const modoEntrega: 'MOSTRADOR' | 'BODEGA' = modo === 'BODEGA' || !puedeEntregar ? 'BODEGA' : 'MOSTRADOR';
    if (!cart.length || cobrandoRef.current || comprobandoRef.current || modalTicket || storageError || draftError || loadedKey !== pendingKey ||
      (esDescuentoExcedido && !ventaPendiente) || (ventaPendiente && recoveryStatus !== 'NO_REGISTRADA')) return;
    if (!ventaPendiente && metodoPago === 'CREDITO' && !clienteId) {
      setErrorText('Seleccione un cliente registrado para vender a crédito'); return;
    }
    if (!ventaPendiente && (metodoPago === 'TARJETA' || metodoPago === 'TRANSFERENCIA')) {
      if (autorizacionBancaria.referencia.trim().length < 3) { setErrorText('Registre la autorización bancaria antes de confirmar la venta'); return; }
      if (metodoPago === 'TARJETA' && !autorizacionBancaria.terminal.trim()) { setErrorText('Indique la terminal del POS bancario'); return; }
    }
    const requestKey = pendingKey;
    cobrandoRef.current = true;
    setProcesandoVenta(true);
    setErrorText(null);
    let enviado = false;
    let requestIdentity = ventaPendiente?.solicitudId;
    try {
      const stored = readRecovery(pendingKey, draftKey);
      if (stored.error) throw new Error(stored.error);
      if (stored.pending && stored.pending.solicitudId !== ventaPendiente?.solicitudId) {
        throw new Error('Hay una venta pendiente en otra pestaña. Recargue y revise esa venta antes de cobrar.');
      }
      // Una consulta previa puede haberse quedado antigua o venir de otra pestaña.
      // Consultar cada reintento evita reenviar una venta que ya está registrada.
      const pendingIdentity = stored.pending?.solicitudId || ventaPendiente?.solicitudId;
      requestIdentity = pendingIdentity;
      if (pendingIdentity) {
        const { data: status } = await api.get(`/ventas/solicitudes/${pendingIdentity}`);
        if (!isCurrentPending(requestKey, pendingIdentity)) return;
        if (status.estado === 'REGISTRADA') { mostrarVenta(status.venta, pendingIdentity); return; }
        if (status.estado !== 'NO_REGISTRADA') throw new Error('No se pudo comprobar el estado de la venta.');
      }
      const pending = stored.pending || {
        solicitudId: pendingIdentity || crypto.randomUUID(), cart, clienteNombre, clienteRtn, clienteId,
        vencimiento: vencimiento || undefined, metodoPago, descuentoPorcentaje, modoEntrega,
        pagoElectronico: pagoElectronicoDesde(metodoPago, autorizacionBancaria),
      };
      localStorage.setItem(pendingKey, JSON.stringify(pending));
      requestIdentity = pending.solicitudId;
      pendingIdentityRef.current = pending.solicitudId;
      setVentaPendiente(pending);
      setRecoveryStatus('SIN_COMPROBAR');
      const descuentoPendiente = calcularVentaPOS(pending.cart, pending.descuentoPorcentaje).descuento / 100;
      enviado = true;
      const { data } = await api.post('/ventas', {
        solicitudId: pending.solicitudId, clienteId: pending.clienteId, vencimiento: pending.vencimiento || undefined,
        clienteNombre: pending.clienteNombre, clienteRtn: pending.clienteRtn || undefined,
        metodoPago: pending.metodoPago, pagoElectronico: pending.pagoElectronico, descuento: descuentoPendiente,
        detalles: pending.cart.map(i => ({ productoId: i.productoId, cantidad: i.cantidad,
          precioUnitario: i.precioUnitario, sinInventario: i.sinInventario, proveedorId: i.proveedorId,
          modoEntrega: i.sinInventario ? undefined : (pending.modoEntrega ?? 'MOSTRADOR') })),
      });
      // Conservar el pendiente hasta que el cajero cierre el comprobante.
      if (!isCurrentPending(requestKey, pending.solicitudId)) return;
      mostrarVenta(data, pending.solicitudId);
      await fetchProductos();
    } catch (err: any) {
      if (activeKey.current !== requestKey || (requestIdentity && !isCurrentPending(requestKey, requestIdentity))) return;
      if (!enviado) {
        if (ventaPendiente) {
          setRecoveryStatus('SIN_COMPROBAR');
          setErrorText('No se pudo comprobar o guardar la venta pendiente. Revise la conexión y pida ayuda antes de cobrar.');
        } else setStorageError(err.message || 'No se pudo guardar la recuperación. No se envió la venta.');
      } else {
        // Conservar identidad incluso ante rechazo: una petición anterior pudo confirmarse.
        setErrorText(err.response?.data?.message || 'No recibimos confirmación. Revise la venta pendiente antes de cobrar otra vez.');
      }
    } finally {
      cobrandoRef.current = false;
      if (activeKey.current === requestKey) setProcesandoVenta(false);
    }
  };

  const cerrarComprobante = () => {
    try {
      const receipt = receiptRecoveryRef.current;
      if (!receipt || activeKey.current !== receipt.pendingKey) return;
      const recovery = readRecovery(receipt.pendingKey, receipt.draftKey);
      if (recovery.error) throw new Error(recovery.error);
      if (!recovery.pending || recovery.pending.solicitudId !== receipt.solicitudId) {
        restoreRecovery();
        setErrorText(null);
        return;
      }
      // Quitar borrador primero: un corte entre ambas escrituras conserva el pendiente.
      // Otro borrador puede haberse preparado desde que se mostró el comprobante.
      if (localStorage.getItem(receipt.draftKey) === receipt.draft) localStorage.removeItem(receipt.draftKey);
      localStorage.removeItem(receipt.pendingKey);
    } catch {
      setErrorText('La venta está registrada, pero no se pudo cerrar su recuperación. Pida ayuda antes de iniciar otra venta.');
      return;
    }
    restoreRecovery();
    setErrorText(null);
  };

  return (
    <div style={styles.container} className="ferre-pos">
      <TopBar title={t('pos.title')} subtitle={t('pos.subtitle')} />

      <main ref={contenidoRef} style={styles.content} className="ferre-pos-main">
        {(storageError || draftError) && <div role="alert" className="ferre-pos-recovery">{storageError || draftError}</div>}
        {borradorRecuperado && !ventaPendiente && cart.length > 0 && <div role="status" className="ferre-pos-recovery">Recuperamos los productos de su venta en preparación. Revise cantidades y precios antes de cobrar. Todavía no se ha registrado.</div>}
        {cart.length > 0 && !ventaPendiente && !modalTicket && !storageError && !draftError && <p role="status">Borrador guardado en este equipo. Todavía no se ha registrado una venta.</p>}
        {ventaPendiente && !modalTicket && (
          <div role="status" className="ferre-pos-recovery">
            <strong>Había una venta en proceso.</strong>
            <p>{recoveryStatus === 'NO_REGISTRADA' ? 'La venta todavía no aparece registrada. Antes de continuar, compruebe si ya recibió el efectivo o si la terminal cobró. Continuar guarda esta misma venta; no vuelva a cobrar al cliente si ya pagó.' : 'Primero revise si quedó registrada. No vuelva a cobrar al cliente mientras no se confirme el resultado.'}</p>
            <button type="button" className="btn btn-primary" onClick={comprobarVenta} disabled={comprobando || procesandoVenta}>{comprobando ? 'Revisando…' : 'Revisar venta y continuar'}</button>
            {recoveryStatus === 'NO_REGISTRADA' && !corrigiendoPendiente && <button type="button" className="btn btn-secondary" disabled={procesandoVenta || comprobando} onClick={() => setCorrigiendoPendiente(true)}>Corregir datos de esta venta</button>}
            {recoveryStatus === 'NO_REGISTRADA' && <button type="button" className="btn btn-secondary" onClick={handleCobrar} disabled={procesandoVenta || comprobando || !!storageError || !!draftError}>Ya revisé el pago: continuar registro</button>}
          </div>
        )}
        {avisoExistencia && (
          <div role="status" style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: '4px', color: '#92400E', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <span>{avisoExistencia}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAvisoExistencia(null)}>Entendido</button>
          </div>
        )}
        {errorText && (
          <div style={{
            marginBottom: '16px',
            padding: '12px 16px',
            backgroundColor: '#FEE2E2',
            border: '1px solid #EF4444',
            borderRadius: '4px',
            color: '#991B1B',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldAlert size={18} />
              <span>{errorText}</span>
            </div>
            <button type="button" onClick={fetchProductos} className="btn btn-secondary btn-sm">
              {t('common.retry')}
            </button>
          </div>
        )}

        {/* Layout en dos columnas: Izquierda catálogo rápido, Derecha Carrito & Cobro */}
        <div style={styles.posGrid} className="ferre-pos-grid">
          {/* Columna Izquierda: Catálogo y Búsqueda */}
          <div style={styles.catalogColumn}>
            {/* Caja, catálogo y venta sin inventario: controles del catálogo, no del ticket */}
            <div className="ferre-pos-notice"><Link to="/arqueo-caja">Abrir o revisar mi caja</Link> · <Link to="/cuentas">Cuentas y abonos</Link> · <Link to="/entregas">Entregas</Link>{estadoCajaVisible==='cerrada'&&<p>Abra su caja antes de cobrar.</p>}{estadoCajaVisible==='desconocida'&&<p role="alert">{syncCaja.phase==='offline'?'Sin conexión: no se pudo comprobar la caja. Se volverá a comprobar al recuperar la red.':'No se pudo comprobar el estado de la caja por un error de conexión o del servidor. Se reintentará automáticamente; no significa que la caja esté cerrada.'}</p>}</div>
            <button className="btn btn-secondary pos-actualizar" disabled={edicionBloqueada} onClick={async()=>{const data=await fetchProductos();if(data)setCart(current=>current.map(i=>{const p=data.find((p:ProductItem)=>p.id===i.productoId);return p?{...i,precioUnitario:p.precioVenta}:i;}));}}>Actualizar catálogo y precios del carrito</button>
            <div className="ferre-pos-notice"><label><input type="checkbox" checked={special} disabled={edicionBloqueada||cart.length>0} onChange={e=>setSpecial(e.target.checked)}/> Venta sin inventario: mercancía que no entra al local</label>{special&&<select aria-label="Proveedor de venta sin inventario" className="form-input" value={specialProvider} disabled={edicionBloqueada||cart.length>0} onChange={e=>setSpecialProvider(e.target.value)}><option value="">Seleccione proveedor</option>{providers.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select>}</div>
            <div style={styles.searchBox}>
              <Search size={18} strokeWidth={2.4} style={styles.searchIcon} />
              <input
                ref={buscarRef}
                type="text"
                aria-label={t('shell.pos.search_label')}
                aria-keyshortcuts={ATAJO_BUSCAR}
                placeholder={t('pos.search_products')}
                value={search}
                onKeyDown={e=>{if(e.key==='Enter'){const matches=buscarPorCodigo(indiceCatalogo,search.trim());if(matches.length===1){e.preventDefault();agregarAlCarrito(matches[0]);setSearch('');}else if(matches.length>1)setErrorText('Código ambiguo; seleccione el producto');else if(search.trim())void explicarCodigoNoVendible(search.trim());}}}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '38px', height: '46px', fontSize: '15px' }}
                autoFocus
              />
            </div>

            <BarcodeScanner disabled={edicionBloqueada} onCode={code=>{const matches=buscarPorCodigo(indiceCatalogo,code);if(matches.length===1){agregarAlCarrito(matches[0]);setSearch('');}else{setSearch(code);if(matches.length)setErrorText('Código ambiguo; seleccione el producto');else void explicarCodigoNoVendible(code);}}}/>
            <div style={styles.catalogGrid} className="ferre-pos-catalog">
              {tarjetasCatalogo}
            </div>
            {catalogoFiltrado.length > limiteCatalogo && (
              <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                <span>Mostrando {limiteCatalogo} de {catalogoFiltrado.length} productos. Escriba para acotar la búsqueda.</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLimiteCatalogo(limiteCatalogo + TARJETAS_POR_PAGINA)}>Mostrar más</button>
              </div>
            )}
          </div>

          {/* Columna Derecha: ticket. El cuerpo (cliente, líneas y descuento) se desplaza; el pie con total,
              método de pago y cobro queda siempre visible en escritorio. */}
          <div ref={ticketRef} className="industrial-card pos-ticket" style={styles.cartColumn}>
            {/* Cabecera del ticket */}
            <div style={styles.cartHeader}>
              <div style={styles.cartTitle}>{t('pos.cart').toUpperCase()}</div>
              <span className="badge badge-dark">{t('operational.items')} {cart.length}</span>
            </div>

            <div className="pos-ticket-cuerpo">
            {/* Paso 1 · Cliente: resumen plegado; se abre para cambiarlo o cuando el crédito exige un cliente registrado */}
            <PasoTicket numero={1} titulo={t('shell.pos.step_client')} />
            {!clienteVisible ? (
              <div className="pos-cliente-resumen">
                <User size={16} strokeWidth={2.4} color="var(--color-primary-text)" aria-hidden="true" />
                <span className="pos-cliente-nombre">
                  <strong>{clienteNombre || 'Consumidor Final'}</strong>
                  {clienteRtn && <small>RTN {clienteRtn}</small>}
                </span>
                {clienteId && <span className="badge badge-success">{t('shell.pos.client_registered')}</span>}
                {!edicionBloqueada && (
                  <button type="button" className="btn btn-secondary btn-sm" aria-expanded={false} aria-controls="pos-cliente-detalle" onClick={() => setClienteAbierto(true)}>
                    {t('shell.pos.client_change')}
                  </button>
                )}
              </div>
            ) : (
              <div id="pos-cliente-detalle">
                <div style={styles.clientSection}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={16} strokeWidth={2.4} color="var(--color-primary-text)" aria-hidden="true" />
                    <input
                      type="text"
                      value={clienteNombre}
                      disabled={edicionBloqueada || !!clienteId}
                      onChange={(e) => setClienteNombre(e.target.value)}
                      className="form-input"
                      style={{ padding: '6px 10px', fontSize: '13px', flex: 1, minHeight: 40 }}
                      aria-label={t('shell.pos.client_name_label')}
                      placeholder={t('pos.client_placeholder')}
                    />
                    {clienteId && !edicionBloqueada && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm pos-icono"
                        onClick={() => {
                          setClienteId(undefined);
                          setClienteNombre('Consumidor Final');
                          setClienteRtn('');
                        }}
                        aria-label={t('shell.pos.client_unlink')}
                        title={t('shell.pos.client_unlink')}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={clienteRtn}
                    disabled={edicionBloqueada || !!clienteId}
                    onChange={(e) => setClienteRtn(e.target.value)}
                    className="form-input"
                    style={{ padding: '6px 10px', fontSize: '13px', marginTop: '6px', minHeight: 40 }}
                    aria-label={t('shell.pos.client_rtn_label')}
                    placeholder={t('pos.rtn_placeholder')}
                  />
                </div>

                {!edicionBloqueada&&!clienteId&&<ClientePicker onSelect={(c:ClienteSeleccionable)=>{setClienteId(c.id);setClienteNombre(c.nombre);setClienteRtn(c.rtn||'');setClienteAbierto(false);}}/>}
                {clienteAbierto && (
                  <button type="button" className="btn btn-secondary btn-sm" aria-expanded={true} aria-controls="pos-cliente-detalle" onClick={() => setClienteAbierto(false)}>
                    <ChevronUp size={14} aria-hidden="true" /> {t('shell.pos.client_done')}
                  </button>
                )}
              </div>
            )}
            {clienteId&&<p style={{ fontSize: '12px', color: '#15803D', fontWeight: 700, marginTop: '4px' }}>✓ Cliente registrado seleccionado.</p>}
            {metodoPago==='CREDITO'&&<label>Vencimiento del crédito<input className="form-input" type="date" value={vencimiento} disabled={edicionBloqueada} onChange={e=>setVencimiento(e.target.value)}/></label>}
            {/* Paso 2 · Productos */}
            <PasoTicket numero={2} titulo={t('shell.pos.step_products')} derecha={cart.length === 1 ? t('shell.pos.line_one', { count: cart.length }) : t('shell.pos.line_other', { count: cart.length })} />
            {/* Lista de ítems en carrito */}
            <div style={styles.cartItemsList}>
              {cart.length === 0 ? (
                <div style={styles.emptyCart}>
                  <Receipt size={40} strokeWidth={1.5} color="#A8A29E" aria-hidden="true" />
                  <p style={{ marginTop: '8px', fontWeight: 600 }}>{t('pos.empty_cart')}</p>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {t('pos.select_products')}
                  </span>
                </div>
              ) : (
                cart.map((item, index) => (
                  <div key={item.productoId} className="pos-linea">
                    <div className="pos-linea-info">
                      <div style={styles.cartItemName}>{item.nombre}</div>
                      <div style={styles.cartItemPrice}>
                        {item.sinInventario&&'Sin inventario · '}{item.cantidad} x {formatLempiras(item.precioUnitario)}
                      </div>
                    </div>

                    <div className="pos-linea-cantidad">
                      <button
                        type="button"
                        className="pos-cantidad-btn"
                        onClick={() => modificarCantidad(item.productoId, -1)}
                        disabled={edicionBloqueada}
                        aria-label={t('shell.pos.qty_less', { name: item.nombre })}
                      >
                        <Minus size={16} strokeWidth={2.6} aria-hidden="true" />
                      </button>
                      <input className="pos-cantidad-input" aria-label={`Cantidad ${item.nombre}`} type="number" min="0.01" step="0.01" value={item.cantidad} disabled={edicionBloqueada} onChange={e=>{const q=Number(e.target.value);if(q>0)setCart(cart.map(i=>i.productoId===item.productoId?{...i,cantidad:q}:i));}}/>
                      <button
                        type="button"
                        className="pos-cantidad-btn"
                        onClick={() => modificarCantidad(item.productoId, 1)}
                        disabled={edicionBloqueada}
                        aria-label={t('shell.pos.qty_more', { name: item.nombre })}
                      >
                        <Plus size={16} strokeWidth={2.6} aria-hidden="true" />
                      </button>
                    </div>

                    <div className="pos-linea-subtotal" style={styles.itemSubtotal}>
                      {formatLempiras(totalesCentavos.lineas[index] / 100)}
                    </div>

                    <button
                      type="button"
                      className="pos-linea-quitar"
                      onClick={() => eliminarDelCarrito(item.productoId)}
                      disabled={edicionBloqueada}
                      aria-label={t('shell.pos.remove_line', { name: item.nombre })}
                      title={t('shell.pos.remove_line', { name: item.nombre })}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Sección de Descuento y Autorización */}
            <div style={styles.descuentoSection}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                <label htmlFor="pos-descuento" style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Percent size={13} color="var(--color-primary-text)" aria-hidden="true" /> {t('pos.apply_discount')}
                </label>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t('operational.limite_cajero')} {descuentoMaximoPermitido}%</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  id="pos-descuento"
                  type="number"
                  min="0"
                  max="100"
                  value={descuentoPorcentaje}
                  disabled={edicionBloqueada}
                  onChange={(e) => {
                    setDescuentoPorcentaje(Math.min(100, Math.max(0, Number(e.target.value))));
                                  }}
                  className="form-input"
                  style={{ padding: '6px 10px', fontSize: '13px', width: '90px', fontWeight: 800, minHeight: 40 }}
                />
                {montoDescuento > 0 && (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626' }}>
                    -{formatLempiras(montoDescuento)}
                  </span>
                )}
              </div>

            </div>
            </div>

            <div className="pos-ticket-pie" ref={pieTicketRef}>
            {/* Totales Fiscales */}
            <div style={styles.totalsSection}>
              <div style={styles.totalRow}>
                <span style={styles.totalLabel}>{t('operational.subtotal_bruto')}</span>
                <span style={styles.totalVal}>{formatLempiras(subtotalBruto)}</span>
              </div>
              {montoDescuento > 0 && (
                <div style={styles.totalRow}>
                  <span style={{ ...styles.totalLabel, color: '#DC2626' }}>{t('operational.descuento')}{descuentoPorcentaje}%):</span>
                  <span style={{ ...styles.totalVal, color: '#DC2626' }}>-{formatLempiras(montoDescuento)}</span>
                </div>
              )}
              <div style={styles.totalRow}>
                <span style={styles.totalLabel}>ISV (15%):</span>
                <span style={styles.totalVal}>{formatLempiras(isv)}</span>
              </div>
              <div style={{ ...styles.totalRow, ...styles.grandTotalRow }}>
                <span style={styles.grandTotalLabel}>{t('pos.total_due')}</span>
                <span style={styles.grandTotalVal}>{formatLempiras(total)}</span>
              </div>
            </div>

            {/* Paso 3 · Pago y entrega */}
            <PasoTicket numero={3} titulo={t('shell.pos.step_payment')} />
            {/* Método de Pago: botones de alternancia; el seleccionado se distingue por relleno, borde e icono */}
            <div role="group" aria-label={t('shell.pos.payment_method')} className="pos-metodos">
              {METODOS_PAGO.map(({ valor, etiqueta, Icono }) => (
                <button key={valor} type="button" className="pos-metodo" aria-pressed={metodoPago === valor} disabled={edicionBloqueada} onClick={() => setMetodoPago(valor)}>
                  {metodoPago === valor ? <CheckCircle size={16} strokeWidth={2.4} aria-hidden="true" /> : <Icono size={16} strokeWidth={2.2} aria-hidden="true" />}
                  <span>{t(etiqueta)}</span>
                </button>
              ))}
            </div>

            {(metodoPago === 'TARJETA' || metodoPago === 'TRANSFERENCIA') && !ventaPendiente && (
              <div style={styles.paymentMethods}>
                <label>Autorización bancaria
                  <input className="form-input" maxLength={40} value={autorizacionBancaria.referencia} disabled={edicionBloqueada}
                    onChange={e => setAutorizacionBancaria({ ...autorizacionBancaria, referencia: e.target.value })} />
                </label>
                {metodoPago === 'TARJETA' && (
                  <label>Terminal POS
                    <input className="form-input" maxLength={40} value={autorizacionBancaria.terminal} disabled={edicionBloqueada}
                      onChange={e => setAutorizacionBancaria({ ...autorizacionBancaria, terminal: e.target.value })} />
                  </label>
                )}
              </div>
            )}

            {/* Botón de Cobro o Solicitar Autorización */}
            {esDescuentoExcedido ? (
              <p role="alert">El descuento supera su límite. Un administrador debe registrar esta venta.</p>

            ) : (
              <>
              <button
                ref={cobrarRef}
                id="pos-cobrar"
                type="button"
                className="btn btn-primary"
                onClick={handleCobrar}
                disabled={cart.length === 0 || edicionBloqueada || !!draftError || !!ventaPendiente}
                aria-busy={procesandoVenta}
                aria-keyshortcuts={ATAJO_COBRAR}
                style={{ ...styles.checkoutBtn, opacity: cart.length === 0 ? 0.5 : 1 }}
              >
                <CheckCircle size={20} strokeWidth={2.5} aria-hidden="true" />
                {procesandoVenta && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
                <span>{t(procesandoVenta ? 'pos.processing' : 'pos.checkout')} {formatLempiras(total)}</span>
              </button>
              {puedeEntregar ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleCobrar('BODEGA')}
                  disabled={cart.length === 0 || edicionBloqueada || !!draftError || !!ventaPendiente}
                  aria-busy={procesandoVenta}
                  style={{ ...styles.checkoutSecondary, opacity: cart.length === 0 ? 0.5 : 1 }}
                >
                  <span>Cobrar y dejar en bodega (entrega después)</span>
                </button>
              ) : (
                <p role="note" style={{ marginTop: 8, fontSize: 13 }}>La mercancía la entrega bodega o administración; consulte «Entregas» para ver el estado.</p>
              )}
              </>
            )}
            <p className="pos-atajos"><kbd>{ATAJO_BUSCAR}</kbd> {t('shell.pos.shortcut_search')} · <kbd>{ATAJO_COBRAR}</kbd> {t('shell.pos.shortcut_checkout')} · <kbd>Enter</kbd> {t('shell.pos.shortcut_confirm')}</p>
            </div>
          </div>
        </div>
      </main>

      {/* Teléfono: el ticket queda debajo del catálogo. Esta barra muestra el total y lleva al pie del ticket;
          no registra la venta (el cobro sigue siendo el botón «Procesar Venta»). */}
      {cart.length > 0 && !modalTicket && (
        <div className="pos-barra-movil">
          <span className="pos-barra-movil-total">
            <small>{t('shell.pos.pending_items', { count: cart.length })} · {t(ETIQUETA_METODO[metodoPago])}</small>
            <strong>{formatLempiras(total)}</strong>
          </span>
          <button type="button" className="btn btn-primary" onClick={() => { pieTicketRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); cobrarRef.current?.focus({ preventScroll: true }); }}>
            {t('shell.pos.go_to_checkout')}
          </button>
        </div>
      )}

      {/* Modal de Comprobante / Ticket Generado */}
      {modalTicket && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.ticketModal}>
            <p role="status">Venta registrada. Puede imprimir o descargar el comprobante. No vuelva a cobrarla.</p>
            {errorText && <p role="alert">{errorText}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={cerrarComprobante}
                style={styles.closeBtn}
              >
                <X size={20} />
              </button>
            </div>

            {/* Ticket Impreso con Branding del Tenant */}
            <style>{`@page { size: ${tamanoPaginaImpresion(tenant.formatoImpresion, ventaRegistrada?.detalles?.length ?? cart.length)}; }`}</style>
            <div style={{ ...styles.printableTicket, ...anchoTicketCss(tenant.formatoImpresion) }}>
              <div style={styles.ticketBrandHeader}>
                <LogotipoNegocio size={44} conIcono={false} />
                <div style={styles.ticketTenantName}>{tenant.nombreComercial}</div>
                {tenant.telefono && <div style={styles.ticketMeta}>{tenant.telefono}</div>}
                {tenant.direccion && <div style={styles.ticketMeta}>{tenant.direccion}</div>}
                {tenant.email && <div style={styles.ticketMeta}>{tenant.email}</div>}
                <div style={styles.ticketMeta}>{t('pos.currency')}: {tenant.moneda?.codigo || 'HNL'}</div>
              </div>

              <div style={styles.ticketDashed} />

              <div style={styles.ticketFacturaMeta}>
                <div><strong>{t('pos.receipt')}</strong></div>
                <div>{t('pos.invoice_number')}: <strong>V-{numeroVentaGenerado}</strong></div>
                <div>{t('common.date')}: {ventaRegistrada?.createdAt ? new Date(ventaRegistrada.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-HN', { timeZone: ZONA_HORARIA_NEGOCIO }) : ''}</div>
                <div>{t('pos.cashier')}: {user?.nombre || ''}</div>
                <div>{t('common.client')}: {clienteNombre}</div>
                {clienteRtn && <div>{t('pos.customer_rtn')}: {clienteRtn}</div>}
              </div>

              <div style={styles.ticketDashed} />

              <table style={styles.ticketTable}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>{t('common.description')}</th>
                    <th style={{ textAlign: 'center' }}>{t('common.quantity')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((i, index) => (
                    <tr key={i.productoId}>
                      <td style={{ textAlign: 'left' }}>{i.nombre}</td>
                      <td style={{ textAlign: 'center' }}>{i.cantidad}</td>
                      <td style={{ textAlign: 'right' }}>
                        {formatLempiras(totalesCentavos.lineas[index] / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={styles.ticketDashed} />

              <div style={styles.ticketTotals}>
                <div>{t('common.subtotal')}: {formatLempiras(Number(ventaRegistrada?.subtotal ?? subtotalBruto))}</div>
                {Number(ventaRegistrada?.descuento ?? montoDescuento) > 0 && <div>Descuento: -{formatLempiras(Number(ventaRegistrada?.descuento ?? montoDescuento))}</div>}
                <div>ISV (15%): {formatLempiras(Number(ventaRegistrada?.isv ?? isv))}</div>
                <div style={{ fontSize: '15px', fontWeight: 900, marginTop: '4px' }}>
                  {t('pos.total_paid')}: {formatLempiras(Number(ventaRegistrada?.total ?? total))}
                </div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>
                  {t('pos.payment_method')}: {t(ETIQUETA_METODO[metodoPago] ?? 'pos.credit')}
                </div>
              </div>

              <div style={styles.ticketDashed} />

              <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '10px' }}>
                {t('pos.thanks')} • Jowa System
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onPointerEnter={precargarGeneradorPDF}
                onFocus={precargarGeneradorPDF}
                onClick={async () => {
                  if (!numeroVentaGenerado) return;
                  await descargarReciboPDF(
                    {
                      tipo: 'VENTA',
                      numeroDocumento: numeroVentaGenerado,
                      fechaEmision: ventaRegistrada?.createdAt ? new Date(ventaRegistrada.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-HN', { timeZone: ZONA_HORARIA_NEGOCIO }) : '',
                      clienteNombre: clienteNombre || 'Consumidor Final',
                      clienteRtn: clienteRtn || undefined,
                      vendedorNombre: user?.nombre || '',
                      metodoPago,
                      items: cart.map((item, index) => ({
                        codigo: item.codigo,
                        descripcion: item.nombre,
                        cantidad: item.cantidad,
                        precioUnitario: item.precioUnitario,
                        subtotal: totalesCentavos.lineas[index] / 100,
                        totalLinea: totalesCentavos.lineas[index] / 100,
                      })),
                      subtotal: Number(ventaRegistrada?.subtotal ?? subtotalBruto),
                      descuento: Number(ventaRegistrada?.descuento ?? montoDescuento),
                      isv: Number(ventaRegistrada?.isv ?? isv),
                      total: Number(ventaRegistrada?.total ?? total),
                      // Crédito: el total queda como saldo pendiente. Otros métodos: pagado al emitir.
                      pagado: metodoPago === 'CREDITO' ? 0 : Number(ventaRegistrada?.total ?? total),
                      saldoPendiente: metodoPago === 'CREDITO' ? Number(ventaRegistrada?.total ?? total) : 0,
                      tenant,
                    },
                    `Venta-${numeroVentaGenerado}.pdf`
                  );
                }}
                style={{ flex: '1 1 100%', backgroundColor: tenant.colorPrimario, borderColor: tenant.colorPrimario }}
              >
                <Download size={16} strokeWidth={2.4} /> {t('pos.download_receipt')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => window.print()}
                style={{ flex: 1 }}
              >
                <Printer size={16} strokeWidth={2.4} /> {t('pos.print_ticket')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cerrarComprobante}
                style={{ flex: 1 }}
              >
                {t('pos.new_sale')}
              </button>
            </div>
          </div>
        </div>
      )}
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
  posGrid: {
    display: 'grid',
    gridTemplateColumns: '1.4fr 1fr',
    gap: '24px',
    alignItems: 'start',
  },
  catalogColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  searchBox: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--color-text-muted)',
  },
  catalogGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '14px',
  },
  productCard: {
    padding: '16px 14px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: '130px',
    userSelect: 'none',
    width: '100%',
    textAlign: 'left',
    font: 'inherit',
    color: 'inherit',
  },
  skuBadge: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
  },
  productName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '13px',
    lineHeight: 1.25,
    margin: '6px 0',
    color: 'var(--color-text-main)',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  priceText: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '15px',
    color: 'var(--color-primary-text)',
  },
  stockText: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    fontWeight: 600,
  },
  cartColumn: {
    display: 'flex',
    flexDirection: 'column',
    padding: '20px',
    position: 'sticky',
    top: '16px',
    maxHeight: 'var(--pos-ticket-alto, calc(100vh - 32px))',
  },
  cartHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '12px',
    borderBottom: '2px solid var(--color-border)',
  },
  cartTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '14px',
    letterSpacing: '0.04em',
  },
  clientSection: {
    padding: '12px 0',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  cartItemsList: {
    minHeight: '120px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px 0',
  },
  emptyCart: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    color: 'var(--color-text-muted)',
  },
  cartItemName: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '12px',
    lineHeight: 1.2,
  },
  cartItemPrice: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginTop: '2px',
  },
  itemSubtotal: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '13px',
    minWidth: '70px',
    textAlign: 'right',
  },
  descuentoSection: {
    padding: '10px 0',
    borderTop: '1px solid var(--color-border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  alertaDescuentoBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    backgroundColor: '#FEE2E2',
    border: '1.5px solid #EF4444',
    borderRadius: 'var(--radius-xs)',
    marginTop: '4px',
  },
  totalsSection: {
    paddingTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    fontWeight: 600,
  },
  totalLabel: {
    color: 'var(--color-text-muted)',
  },
  totalVal: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
  },
  grandTotalRow: {
    borderTop: '1px dashed var(--color-border)',
    paddingTop: '6px',
    marginTop: '3px',
    alignItems: 'baseline',
  },
  grandTotalLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '14px',
  },
  grandTotalVal: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '24px',
    color: 'var(--color-text-main)',
    fontVariantNumeric: 'tabular-nums',
  },
  paymentMethods: {
    display: 'flex',
    gap: '8px',
    margin: '14px 0 12px',
  },
  checkoutBtn: {
    width: '100%',
    minHeight: '52px',
    padding: '14px',
    fontSize: '16px',
  },
  // «Cobrar y dejar en bodega» es una variante menos frecuente: menor peso que el cobro principal.
  checkoutSecondary: {
    width: '100%',
    minHeight: '40px',
    marginTop: 8,
    fontSize: '13px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: '20px',
  },
  ticketModal: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: '#FFFFFF',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  printableTicket: {
    fontFamily: 'monospace',
    padding: '12px 8px',
  },
  ticketBrandHeader: {
    textAlign: 'center',
    marginBottom: '8px',
  },
  ticketLogo: {
    fontWeight: 900,
    fontSize: '16px',
    letterSpacing: '0.05em',
  },
  ticketTenantName: {
    fontWeight: 700,
    fontSize: '13px',
    marginTop: '2px',
  },
  ticketMeta: {
    fontSize: '10px',
    color: '#555',
  },
  ticketDashed: {
    borderBottom: '1px dashed var(--color-text-muted)',
    margin: '8px 0',
  },
  ticketFacturaMeta: {
    fontSize: '11px',
    lineHeight: 1.4,
  },
  ticketTable: {
    width: '100%',
    fontSize: '11px',
    borderCollapse: 'collapse',
    margin: '4px 0',
  },
  ticketTotals: {
    textAlign: 'right',
    fontSize: '12px',
    lineHeight: 1.5,
  },
};
