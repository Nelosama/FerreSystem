import { Link } from 'react-router-dom';
import { ClientePicker, type ClienteSeleccionable } from '../components/ClientePicker';
import './POSPage.css';
import { BarcodeScanner } from '../components/BarcodeScanner';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import type { ProductItem } from '../types';
import { api } from '../utils/api';
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
} from 'lucide-react';
import { ZONA_HORARIA_NEGOCIO, formatLempiras } from '../utils/format';
import { descargarReciboPDF } from '../components/ReciboPDF';

// Autorización bancaria de tarjeta/transferencia: la registra el cajero tras la aprobación del POS físico.
const pagoElectronicoDesde = (metodo: string, aut: { referencia: string; terminal: string }) =>
  (metodo === 'TARJETA' || metodo === 'TRANSFERENCIA') ? { referencia: aut.referencia.trim(), terminal: aut.terminal.trim() } : undefined;

export const POSPage: React.FC = () => {
  const { tenant, user } = useTenant();
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

  const [cart, setCart] = useState<CartItem[]>(initialSale?.cart || []);
  const [search, setSearch] = useState('');
  const [clienteNombre, setClienteNombre] = useState(initialSale?.clienteNombre || 'Consumidor Final');
  const [clienteRtn, setClienteRtn] = useState(initialSale?.clienteRtn || '');
  const [clienteId,setClienteId]=useState<string|undefined>(initialSale?.clienteId);
  const [vencimiento,setVencimiento]=useState(initialSale?.vencimiento||'');
  const [providers,setProviders]=useState<any[]>([]);
  const [special,setSpecial]=useState(!!initialSale?.cart[0]?.sinInventario);
  const [specialProvider,setSpecialProvider]=useState(initialSale?.cart[0]?.proveedorId || '');
  const [cajaAbierta,setCajaAbierta]=useState(false);
  useEffect(()=>{let alive=true;setProviders([]);setCajaAbierta(false);api.get('/operaciones/proveedores').then(r=>{if(alive)setProviders(r.data);}).catch(()=>{});api.get('/operaciones/caja').then(r=>{if(alive)setCajaAbierta(r.data.some((c:any)=>c.estado==='ABIERTA'));}).catch(()=>{if(alive)setCajaAbierta(false);});return()=>{alive=false;};},[tenant.id,user?.id]);
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'CREDITO' | 'TRANSFERENCIA'>(initialSale?.metodoPago || 'EFECTIVO');
  const [autorizacionBancaria, setAutorizacionBancaria] = useState({ referencia: '', terminal: '' });
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState<number>(initialSale?.descuentoPorcentaje || 0);
  const cobrandoRef = useRef(false);
  const [procesandoVenta, setProcesandoVenta] = useState(false);
  const [modalTicket, setModalTicket] = useState(false);
  const [numeroVentaGenerado, setNumeroVentaGenerado] = useState<number | null>(null);
  const [ventaRegistrada, setVentaRegistrada] = useState<any>(null);
  const edicionBloqueada = procesandoVenta || comprobando || (!!ventaPendiente && !corrigiendoPendiente) || modalTicket || !!storageError || loadedKey !== pendingKey;

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

  const fetchProductos = useCallback(async () => {
    const requestKey=activeKey.current;
    setErrorText(null);
    try {
      const response = await api.get('/productos/comercial');
      if(requestKey!==activeKey.current)return;
      const data = response.data.map((p: any) => ({
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
      }));
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
  const subtotalBruto = cart.reduce((acc, item) => acc + Math.round(item.precioUnitario * item.cantidad * 100)/100, 0);
  const esDescuentoExcedido = descuentoPorcentaje > descuentoMaximoPermitido;
  const montoDescuento = Math.round(subtotalBruto * (descuentoPorcentaje / 100) * 100) / 100;
  const subtotal = subtotalBruto - montoDescuento;
  const isv = Math.round(subtotal * 0.15 * 100) / 100;
  const total = subtotal + isv;

  const agregarAlCarrito = (prod: ProductItem) => {
    if (edicionBloqueada || cobrandoRef.current) return;
    if(special&&!specialProvider){setErrorText('Seleccione proveedor para venta sin inventario');return;}
    const existe = cart.find((i) => i.productoId === prod.id);
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

  const handleCobrar = async () => {
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
        vencimiento: vencimiento || undefined, metodoPago, descuentoPorcentaje,
        pagoElectronico: pagoElectronicoDesde(metodoPago, autorizacionBancaria),
      };
      localStorage.setItem(pendingKey, JSON.stringify(pending));
      requestIdentity = pending.solicitudId;
      pendingIdentityRef.current = pending.solicitudId;
      setVentaPendiente(pending);
      setRecoveryStatus('SIN_COMPROBAR');
      const descuentoPendiente = Math.round(pending.cart.reduce((sum, i) => sum + Math.round(i.precioUnitario * i.cantidad * 100) / 100, 0) * pending.descuentoPorcentaje) / 100;
      enviado = true;
      const { data } = await api.post('/ventas', {
        solicitudId: pending.solicitudId, clienteId: pending.clienteId, vencimiento: pending.vencimiento || undefined,
        clienteNombre: pending.clienteNombre, clienteRtn: pending.clienteRtn || undefined,
        metodoPago: pending.metodoPago, pagoElectronico: pending.pagoElectronico, descuento: descuentoPendiente,
        detalles: pending.cart.map(i => ({ productoId: i.productoId, cantidad: i.cantidad,
          precioUnitario: i.precioUnitario, sinInventario: i.sinInventario, proveedorId: i.proveedorId })),
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

      <main style={styles.content} className="ferre-pos-main">
        <div className="ferre-pos-notice"><Link to="/arqueo-caja">Abrir o revisar mi caja</Link> · <Link to="/cuentas">Cuentas y abonos</Link> · <Link to="/entregas">Entregas</Link>{!cajaAbierta&&<p>Abra su caja antes de cobrar.</p>}</div>
        <button className="btn btn-secondary" disabled={edicionBloqueada} onClick={async()=>{const data=await fetchProductos();if(data)setCart(current=>current.map(i=>{const p=data.find((p:ProductItem)=>p.id===i.productoId);return p?{...i,precioUnitario:p.precioVenta}:i;}));}}>Actualizar catálogo y precios del carrito</button>
        <div className="ferre-pos-notice"><label><input type="checkbox" checked={special} disabled={edicionBloqueada||cart.length>0} onChange={e=>setSpecial(e.target.checked)}/> Venta sin inventario: mercancía que no entra al local</label>{special&&<select aria-label="Proveedor de venta sin inventario" className="form-input" value={specialProvider} disabled={edicionBloqueada||cart.length>0} onChange={e=>setSpecialProvider(e.target.value)}><option value="">Seleccione proveedor</option>{providers.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select>}</div>
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
            <div style={styles.searchBox}>
              <Search size={18} strokeWidth={2.4} style={styles.searchIcon} />
              <input
                type="text"
                placeholder={t('pos.search_products')}
                value={search}
                onKeyDown={e=>{if(e.key==='Enter'){const matches=productos.filter(p=>[p.codigo,p.codigoBarras,p.codigoFabricante].some(c=>c?.toUpperCase()===search.trim().toUpperCase()));if(matches.length===1){e.preventDefault();agregarAlCarrito(matches[0]);setSearch('');}else if(matches.length>1)setErrorText('Código ambiguo; seleccione el producto');}}}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '38px', height: '46px', fontSize: '15px' }}
                autoFocus
              />
            </div>

            <BarcodeScanner disabled={edicionBloqueada} onCode={code=>{const matches=productos.filter(p=>[p.codigo,p.codigoBarras,p.codigoFabricante].some(c=>c?.toUpperCase()===code.toUpperCase()));if(matches.length===1){agregarAlCarrito(matches[0]);setSearch('');}else{setSearch(code);setErrorText(matches.length?'Código ambiguo; seleccione el producto':'Código no encontrado; busque por descripción');}}}/>
            <div style={styles.catalogGrid} className="ferre-pos-catalog">
              {productos
                .filter(
                  (p) =>
                    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
                    p.codigo.toLowerCase().includes(search.toLowerCase()) ||
                    p.codigoBarras?.includes(search) || p.codigoFabricante?.toLowerCase().includes(search.toLowerCase()) || p.descripcion?.toLowerCase().includes(search.toLowerCase()),
                )
                .map((prod) => (
                  <div
                    key={prod.id}
                    className="industrial-card"
                    style={styles.productCard}
                    onClick={() => agregarAlCarrito(prod)}
                  >
                    <div style={styles.skuBadge}>{prod.codigo}</div>
                    <div style={styles.productName}>{prod.nombre}</div>
                    <div style={styles.priceRow}>
                      <span style={styles.priceText}>{formatLempiras(prod.precioVenta)}</span>
                      {prod.imagenUrl&&<img src={prod.imagenUrl} alt={prod.nombre} loading="lazy" referrerPolicy="no-referrer" style={{width:80,height:60,objectFit:'contain'}}/>}<span style={styles.stockText}>{prod.stockActual} {t('pos.available')}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Columna Derecha: Factura y Resumen */}
          <div className="industrial-card" style={styles.cartColumn}>
            {/* Cabecera del ticket */}
            <div style={styles.cartHeader}>
              <div style={styles.cartTitle}>{t('pos.cart').toUpperCase()}</div>
              <span className="badge badge-dark">{t('operational.items')} {cart.length}</span>
            </div>

            {/* Selector de Cliente */}
            <div style={styles.clientSection}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={16} strokeWidth={2.4} color="var(--color-primary)" />
                <input
                  type="text"
                  value={clienteNombre}
                  disabled={edicionBloqueada || !!clienteId}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  className="form-input"
                  style={{ padding: '6px 10px', fontSize: '12px', flex: 1 }}
                  placeholder={t('pos.client_placeholder')}
                />
                {clienteId && !edicionBloqueada && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setClienteId(undefined);
                      setClienteNombre('Consumidor Final');
                      setClienteRtn('');
                    }}
                    title="Cambiar o desvincular cliente registrado"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <input
                type="text"
                value={clienteRtn}
                disabled={edicionBloqueada || !!clienteId}
                onChange={(e) => setClienteRtn(e.target.value)}
                className="form-input"
                style={{ padding: '6px 10px', fontSize: '11px', marginTop: '6px' }}
                placeholder={t('pos.rtn_placeholder')}
              />
            </div>

            {!edicionBloqueada&&!clienteId&&<ClientePicker onSelect={(c:ClienteSeleccionable)=>{setClienteId(c.id);setClienteNombre(c.nombre);setClienteRtn(c.rtn||'');}}/>}
            {clienteId&&<p style={{ fontSize: '11px', color: '#15803D', fontWeight: 700, marginTop: '4px' }}>✓ Cliente registrado seleccionado.</p>}
            {metodoPago==='CREDITO'&&<label>Vencimiento del crédito<input className="form-input" type="date" value={vencimiento} disabled={edicionBloqueada} onChange={e=>setVencimiento(e.target.value)}/></label>}
            {/* Lista de ítems en carrito */}
            <div style={styles.cartItemsList}>
              {cart.length === 0 ? (
                <div style={styles.emptyCart}>
                  <Receipt size={40} strokeWidth={1.5} color="#A8A29E" />
                  <p style={{ marginTop: '8px', fontWeight: 600 }}>{t('pos.empty_cart')}</p>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {t('pos.select_products')}
                  </span>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.productoId} style={styles.cartItemRow}>
                    <div style={{ flex: 1 }}>
                      <div style={styles.cartItemName}>{item.nombre}</div>
                      <div style={styles.cartItemPrice}>
                        {item.sinInventario&&'Sin inventario · '}{item.cantidad} x {formatLempiras(item.precioUnitario)}
                      </div>
                    </div>

                    <div style={styles.quantityControls}>
                      <button
                        type="button"
                        onClick={() => modificarCantidad(item.productoId, -1)}
                        disabled={edicionBloqueada}
                        style={styles.qtyBtn}
                      >
                        <Minus size={13} strokeWidth={3} />
                      </button>
                      <input aria-label={`Cantidad ${item.nombre}`} type="number" min="0.01" step="0.01" value={item.cantidad} disabled={edicionBloqueada} style={{width:70,padding:4}} onChange={e=>{const q=Number(e.target.value);if(q>0)setCart(cart.map(i=>i.productoId===item.productoId?{...i,cantidad:q}:i));}}/>
                      <button
                        type="button"
                        onClick={() => modificarCantidad(item.productoId, 1)}
                        style={styles.qtyBtn}
                      >
                        <Plus size={13} strokeWidth={3} />
                      </button>
                    </div>

                    <div style={styles.itemSubtotal}>
                      {formatLempiras(item.cantidad * item.precioUnitario)}
                    </div>

                    <button
                      type="button"
                      onClick={() => eliminarDelCarrito(item.productoId)}
                      disabled={edicionBloqueada}
                      style={styles.deleteBtn}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Sección de Descuento y Autorización */}
            <div style={styles.descuentoSection}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Percent size={13} color="var(--color-primary)" /> {t('pos.apply_discount')}
                </label>
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{t('operational.limite_cajero')} {descuentoMaximoPermitido}%</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={descuentoPorcentaje}
                  disabled={edicionBloqueada}
                  onChange={(e) => {
                    setDescuentoPorcentaje(Math.min(100, Math.max(0, Number(e.target.value))));
                                  }}
                  className="form-input"
                  style={{ padding: '6px 10px', fontSize: '13px', width: '90px', fontWeight: 800 }}
                />
                {montoDescuento > 0 && (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626' }}>
                    -{formatLempiras(montoDescuento)}
                  </span>
                )}
              </div>

            </div>

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

            {/* Método de Pago */}
            <div style={styles.paymentMethods}>{(['EFECTIVO','TARJETA','TRANSFERENCIA','CREDITO'] as const).map(m=><button key={m} type="button" disabled={edicionBloqueada} onClick={()=>setMetodoPago(m)} style={{...styles.payBtn,...(metodoPago===m?styles.payBtnActive:{})}}>{m}</button>)}</div>

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
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCobrar}
                disabled={cart.length === 0 || edicionBloqueada || !!draftError || !!ventaPendiente}
                aria-busy={procesandoVenta}
                style={{ ...styles.checkoutBtn, opacity: cart.length === 0 ? 0.5 : 1 }}
              >
                <CheckCircle size={20} strokeWidth={2.5} />
                {procesandoVenta && <Loader2 size={18} className="animate-spin" />}
                <span>{t(procesandoVenta ? 'pos.processing' : 'pos.checkout')} {formatLempiras(total)}</span>
              </button>
            )}
          </div>
        </div>
      </main>

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
            <div style={styles.printableTicket}>
              <div style={styles.ticketBrandHeader}>
                <div style={{ ...styles.ticketLogo, color: 'var(--color-primary)' }}>
                  FERRESYSTEM POS
                </div>
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
                  {cart.map((i) => (
                    <tr key={i.productoId}>
                      <td style={{ textAlign: 'left' }}>{i.nombre}</td>
                      <td style={{ textAlign: 'center' }}>{i.cantidad}</td>
                      <td style={{ textAlign: 'right' }}>
                        {formatLempiras(i.cantidad * i.precioUnitario)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={styles.ticketDashed} />

              <div style={styles.ticketTotals}>
                <div>{t('common.subtotal')}: {formatLempiras(Number(ventaRegistrada?.subtotal ?? subtotal))}</div>
                <div>ISV (15%): {formatLempiras(Number(ventaRegistrada?.isv ?? isv))}</div>
                <div style={{ fontSize: '15px', fontWeight: 900, marginTop: '4px' }}>
                  {t('pos.total_paid')}: {formatLempiras(Number(ventaRegistrada?.total ?? total))}
                </div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>
                  {t('pos.payment_method')}: {t(`pos.${metodoPago === 'EFECTIVO' ? 'cash' : metodoPago === 'TARJETA' ? 'card' : 'credit'}`)}
                </div>
              </div>

              <div style={styles.ticketDashed} />

              <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '10px' }}>
                {t('pos.thanks')} • FerreSystem
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
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
                      items: cart.map((item) => ({
                        codigo: item.codigo,
                        descripcion: item.nombre,
                        cantidad: item.cantidad,
                        precioUnitario: item.precioUnitario,
                        subtotal: item.cantidad * item.precioUnitario,
                        totalLinea: item.cantidad * item.precioUnitario,
                      })),
                      subtotal: Number(ventaRegistrada?.subtotal ?? subtotal),
                      descuento: Number(ventaRegistrada?.descuento ?? montoDescuento),
                      isv: Number(ventaRegistrada?.isv ?? isv),
                      total: Number(ventaRegistrada?.total ?? total),
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
  },
  skuBadge: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '10px',
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
    color: 'var(--color-primary)',
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
    minHeight: '220px',
    maxHeight: '340px',
    overflowY: 'auto',
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
  cartItemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    backgroundColor: 'var(--color-bg)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-xs)',
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
  quantityControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  qtyBtn: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#FFFFFF',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
  },
  qtyText: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '13px',
    minWidth: '18px',
    textAlign: 'center',
  },
  itemSubtotal: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '13px',
    minWidth: '70px',
    textAlign: 'right',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#DC2626',
    cursor: 'pointer',
    padding: '4px',
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
    borderTop: '2px solid var(--color-border)',
    paddingTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
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
    paddingTop: '8px',
    marginTop: '4px',
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
    fontSize: '22px',
    color: 'var(--color-primary)',
  },
  paymentMethods: {
    display: 'flex',
    gap: '8px',
    margin: '14px 0 12px',
  },
  payBtn: {
    flex: 1,
    padding: '8px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  payBtnActive: {
    backgroundColor: 'var(--color-sidebar-bg)',
    color: '#FFFFFF',
  },
  checkoutBtn: {
    width: '100%',
    padding: '14px',
    fontSize: '15px',
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
