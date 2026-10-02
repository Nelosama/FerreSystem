import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import type { ProductItem } from '../types';
import { api } from '../utils/api';
import { useNotification, type SolicitudDescuento } from '../context/NotificationContext';
import { useI18n } from '../context/I18nContext';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  Receipt,
  User,
  CreditCard,
  Banknote,
  Printer,
  X,
  ShieldAlert,
  Loader2,
  Percent,
  Download,
} from 'lucide-react';
import { formatLempiras } from '../utils/format';
import { descargarReciboPDF } from '../components/ReciboPDF';

interface CartItem {
  productoId: string;
  codigo: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
}

interface PendingSale {
  solicitudId: string;
  cart: CartItem[];
  clienteNombre: string;
  clienteRtn: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'CREDITO';
  descuentoPorcentaje: number;
}

const readPendingSale = (key: string): PendingSale | null => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return null;
    const sale = JSON.parse(saved) as PendingSale;
    const valid = /^[0-9a-f-]{36}$/i.test(sale.solicitudId) && Array.isArray(sale.cart) && sale.cart.length > 0 &&
      sale.cart.every((item) => item && typeof item.productoId === 'string' && typeof item.nombre === 'string' &&
        typeof item.codigo === 'string' && Number.isFinite(item.cantidad) && item.cantidad > 0 &&
        Number.isFinite(item.precioUnitario) && item.precioUnitario >= 0) &&
      typeof sale.clienteNombre === 'string' && typeof sale.clienteRtn === 'string' &&
      ['EFECTIVO', 'TARJETA', 'CREDITO'].includes(sale.metodoPago) &&
      Number.isFinite(sale.descuentoPorcentaje) && sale.descuentoPorcentaje >= 0 && sale.descuentoPorcentaje <= 100;
    return valid ? sale : null;
  } catch {
    return null;
  }
};

export const POSPage: React.FC = () => {
  const { tenant, user } = useTenant();
  const { solicitudes, solicitarDescuento } = useNotification();
  const { t, locale } = useI18n();
  const pendingKey = `ferre_pending_sale:${tenant.id}:${user?.id || ''}`;
  const activeKey = useRef(pendingKey);
  activeKey.current = pendingKey;
  const [ventaPendiente, setVentaPendiente] = useState<PendingSale | null>(() => readPendingSale(pendingKey));

  const [productos, setProductos] = useState<ProductItem[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>(ventaPendiente?.cart || []);
  const [search, setSearch] = useState('');
  const [clienteNombre, setClienteNombre] = useState(ventaPendiente?.clienteNombre || 'Consumidor Final');
  const [clienteRtn, setClienteRtn] = useState(ventaPendiente?.clienteRtn || '');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'CREDITO'>(ventaPendiente?.metodoPago || 'EFECTIVO');
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState<number>(ventaPendiente?.descuentoPorcentaje || 0);
  const cobrandoRef = useRef(false);
  const [procesandoVenta, setProcesandoVenta] = useState(false);
  const [modalTicket, setModalTicket] = useState(false);
  const [numeroVentaGenerado, setNumeroVentaGenerado] = useState<number | null>(null);
  const [ventaRegistrada, setVentaRegistrada] = useState<any>(null);
  const edicionBloqueada = procesandoVenta || !!ventaPendiente || modalTicket;

  useEffect(() => {
    const pending = readPendingSale(pendingKey);
    setVentaPendiente(pending);
    setCart(pending?.cart || []);
    setClienteNombre(pending?.clienteNombre || 'Consumidor Final');
    setClienteRtn(pending?.clienteRtn || '');
    setMetodoPago(pending?.metodoPago || 'EFECTIVO');
    setDescuentoPorcentaje(pending?.descuentoPorcentaje || 0);
    setModalTicket(false);
    setVentaRegistrada(null);
  }, [pendingKey]);

  const fetchProductos = useCallback(async () => {
    setErrorText(null);
    try {
      const response = await api.get('/productos');
      const data = response.data.map((p: any) => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        descripcion: p.descripcion,
        categoria: p.categoria?.nombre || p.categoria || 'General',
        precioVenta: Number(p.precioVenta),
        precioCosto: Number(p.precioCosto),
        stockActual: Number(p.stockActual),
        stockMinimo: Number(p.stockMinimo),
        unidadMedida: p.unidadMedida || 'UNIDAD',
        usaMedida: Boolean(p.usaMedida),
        activo: Boolean(p.activo),
        stockBajo: p.stockBajo ?? (Number(p.stockActual) <= Number(p.stockMinimo)),
      }));
      setProductos(data);
    } catch (err: any) {
      console.error('Error al cargar productos en POS:', err);
      setErrorText('Error de conexión con la API de productos.');
    }
  }, []);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  // Solicitud de autorización de descuento
  const [solicitudActiva, setSolicitudActiva] = useState<SolicitudDescuento | null>(null);
  const [esperandoAutorizacion, setEsperandoAutorizacion] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState<{ tipo: 'APROBADA' | 'RECHAZADA'; porcentaje: number; admin: string } | null>(null);
  const [descuentoAutorizado, setDescuentoAutorizado] = useState<{ porcentaje: number; subtotal: number } | null>(null);

  // Límite de descuento del usuario actual (10% por defecto si no definido)
  const descuentoMaximoPermitido = user?.descuentoMaximo ?? 10;


  // Escuchar cambios en la solicitud activa
  React.useEffect(() => {
    if (!solicitudActiva) return;
    const solActualizada = solicitudes.find((s) => s.id === solicitudActiva.id);
    if (solActualizada && solActualizada.estado !== 'PENDIENTE') {
      setEsperandoAutorizacion(false);
      if (solActualizada.estado === 'APROBADA') {
        setMensajeEstado({ tipo: 'APROBADA', porcentaje: solActualizada.descuentoPorcentaje, admin: solActualizada.respondidoPor || t('pos.admin') });
        setDescuentoAutorizado({ porcentaje: solActualizada.descuentoPorcentaje, subtotal: solActualizada.subtotal });
      } else if (solActualizada.estado === 'RECHAZADA') {
        setMensajeEstado({ tipo: 'RECHAZADA', porcentaje: solActualizada.descuentoPorcentaje, admin: solActualizada.respondidoPor || t('pos.admin') });
        setDescuentoAutorizado(null);
        setDescuentoPorcentaje(0);
      }
      setSolicitudActiva(null);
    }
  }, [solicitudes, solicitudActiva]);

  // Cálculos fiscales hondureños con descuento
  const subtotalBruto = cart.reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0);
  const esDescuentoExcedido = descuentoPorcentaje > descuentoMaximoPermitido &&
    (descuentoAutorizado?.porcentaje !== descuentoPorcentaje || descuentoAutorizado?.subtotal !== subtotalBruto);
  const montoDescuento = Math.round(subtotalBruto * (descuentoPorcentaje / 100) * 100) / 100;
  const subtotal = subtotalBruto - montoDescuento;
  const isv = Math.round(subtotal * 0.15 * 100) / 100;
  const total = subtotal + isv;

  const handleSolicitarAutorizacion = () => {
    if (!user) return;
    setMensajeEstado(null);
    const nuevaSol = solicitarDescuento({
      cajeroId: user.id,
      cajeroNombre: user.nombre,
      subtotal: subtotalBruto,
      totalOriginal: Math.round((subtotalBruto * 1.15) * 100) / 100,
      descuentoPorcentaje,
      totalConDescuento: total,
    });
    setSolicitudActiva(nuevaSol);
    setEsperandoAutorizacion(true);
  };

  const agregarAlCarrito = (prod: ProductItem) => {
    if (edicionBloqueada || cobrandoRef.current) return;
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

  const handleCobrar = async () => {
    if (cart.length === 0 || cobrandoRef.current || modalTicket || (esDescuentoExcedido && !ventaPendiente)) return;
    cobrandoRef.current = true;
    setProcesandoVenta(true);

    try {
      const pending = readPendingSale(pendingKey) || {
        solicitudId: crypto.randomUUID(), cart, clienteNombre, clienteRtn, metodoPago, descuentoPorcentaje,
      };
      // Persistir ANTES del envío: un reload o respuesta perdida reutiliza la operación.
      localStorage.setItem(pendingKey, JSON.stringify(pending));
      setVentaPendiente(pending);
      const descuentoPendiente = Math.round(pending.cart.reduce((sum, i) => sum + i.precioUnitario * i.cantidad, 0) * pending.descuentoPorcentaje) / 100;
      const res = await api.post('/ventas', {
        solicitudId: pending.solicitudId,
        clienteNombre: pending.clienteNombre,
        clienteRtn: pending.clienteRtn || undefined,
        metodoPago: pending.metodoPago,
        descuento: descuentoPendiente,
        detalles: pending.cart.map((i) => ({
          productoId: i.productoId,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
        })),
      });

      const ventaRegistrada = res.data;
      localStorage.removeItem(pendingKey);
      if (activeKey.current !== pendingKey) return;
      setVentaRegistrada(ventaRegistrada);
      setCart(pending.cart);
      setClienteNombre(pending.clienteNombre);
      setClienteRtn(pending.clienteRtn);
      setMetodoPago(pending.metodoPago);
      setDescuentoPorcentaje(pending.descuentoPorcentaje);
      setNumeroVentaGenerado(ventaRegistrada.numeroVenta);
      setModalTicket(true);
      setVentaPendiente(null);
      await fetchProductos(); // Refrescar inventario actualizado
    } catch (err: any) {
      // Solo una validación fallida confirma que la operación no se registró.
      if ([400, 404, 409, 422].includes(err.response?.status)) {
        localStorage.removeItem(pendingKey);
        if (activeKey.current === pendingKey) setVentaPendiente(null);
      }
      if (activeKey.current !== pendingKey) return;
      console.error('Error al procesar cobro de venta:', err);
      alert(err.response?.data?.message || t('pos.sale_error'));
    } finally {
      cobrandoRef.current = false;
      setProcesandoVenta(false);
    }
  };

  return (
    <div style={styles.container}>
      <TopBar title={t('pos.title')} subtitle={t('pos.subtitle')} />

      <main style={styles.content}>
        {ventaPendiente && !procesandoVenta && (
          <div role="status" className="industrial-card" style={{ marginBottom: '16px' }}>
            {t('pos.pending_sale')}
            <button type="button" className="btn btn-primary" onClick={handleCobrar}>{t('pos.retry_sale')}</button>
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
        <div style={styles.posGrid}>
          {/* Columna Izquierda: Catálogo y Búsqueda */}
          <div style={styles.catalogColumn}>
            <div style={styles.searchBox}>
              <Search size={18} strokeWidth={2.4} style={styles.searchIcon} />
              <input
                type="text"
                placeholder={t('pos.search_products')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '38px', height: '46px', fontSize: '15px' }}
                autoFocus
              />
            </div>

            <div style={styles.catalogGrid}>
              {productos
                .filter(
                  (p) =>
                    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
                    p.codigo.toLowerCase().includes(search.toLowerCase()),
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
                      <span style={styles.stockText}>{prod.stockActual} {t('pos.available')}</span>
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
                  disabled={edicionBloqueada}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  className="form-input"
                  style={{ padding: '6px 10px', fontSize: '12px', flex: 1 }}
                  placeholder={t('pos.client_placeholder')}
                />
              </div>
              <input
                type="text"
                value={clienteRtn}
                disabled={edicionBloqueada}
                onChange={(e) => setClienteRtn(e.target.value)}
                className="form-input"
                style={{ padding: '6px 10px', fontSize: '11px', marginTop: '6px' }}
                placeholder={t('pos.rtn_placeholder')}
              />
            </div>

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
                        {item.cantidad} x {formatLempiras(item.precioUnitario)}
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
                      <span style={styles.qtyText}>{item.cantidad}</span>
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
                    setDescuentoAutorizado(null);
                    setMensajeEstado(null);
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

              {esDescuentoExcedido && (
                <div style={styles.alertaDescuentoBox}>
                  <ShieldAlert size={16} color="#DC2626" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '11px', color: '#991B1B' }}>
                      {t('operational.descuento_excede_tu_limite_permitido')}{descuentoMaximoPermitido}%)
                    </div>
                    <div style={{ fontSize: '10px', color: '#B91C1C', marginTop: '2px' }}>
                      {t('operational.requiere_aprobacion_en_tiempo_real_de_un_administrador')}
                    </div>
                  </div>
                </div>
              )}

              {mensajeEstado && (
                <div style={{ ...styles.alertaDescuentoBox, backgroundColor: mensajeEstado.tipo === 'APROBADA' ? '#DCFCE7' : '#FEE2E2', borderColor: mensajeEstado.tipo === 'APROBADA' ? '#15803D' : '#EF4444' }}>
                  <div style={{ fontWeight: 700, fontSize: '11px', color: mensajeEstado.tipo === 'APROBADA' ? '#15803D' : '#991B1B' }}>
                    {t(mensajeEstado.tipo === 'APROBADA' ? 'pos.discount_approved' : 'pos.discount_rejected', { percentage: mensajeEstado.porcentaje, admin: mensajeEstado.admin })}
                  </div>
                </div>
              )}
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
            <div style={styles.paymentMethods}>
              <button
                type="button"
                disabled={edicionBloqueada}
                onClick={() => setMetodoPago('EFECTIVO')}
                style={{
                  ...styles.payBtn,
                  ...(metodoPago === 'EFECTIVO' ? styles.payBtnActive : {}),
                }}
              >
                <Banknote size={16} strokeWidth={2.5} /> {t('pos.cash')}
              </button>
              <button
                type="button"
                disabled={edicionBloqueada}
                onClick={() => setMetodoPago('TARJETA')}
                style={{
                  ...styles.payBtn,
                  ...(metodoPago === 'TARJETA' ? styles.payBtnActive : {}),
                }}
              >
                <CreditCard size={16} strokeWidth={2.5} /> {t('pos.card')}
              </button>
            </div>

            {/* Botón de Cobro o Solicitar Autorización */}
            {esDescuentoExcedido ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSolicitarAutorizacion}
                disabled={esperandoAutorizacion || edicionBloqueada}
                style={{ ...styles.checkoutBtn, backgroundColor: '#DC2626', borderColor: '#B91C1C' }}
              >
                {esperandoAutorizacion ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>{t('pos.waiting_approval')}</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert size={18} />
                    <span>{t('pos.request_approval')}</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCobrar}
                disabled={cart.length === 0 || procesandoVenta || modalTicket}
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
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setModalTicket(false);
                  setCart([]);
                }}
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
                <div>{t('common.date')}: {ventaRegistrada?.createdAt ? new Date(ventaRegistrada.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-HN') : ''}</div>
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
                      fechaEmision: ventaRegistrada?.createdAt ? new Date(ventaRegistrada.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-HN') : '',
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
                onClick={() => {
                  setModalTicket(false);
                  setCart([]);
                }}
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
