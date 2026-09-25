import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
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
} from 'lucide-react';
import { formatLempiras } from '../utils/format';

interface CartItem {
  productoId: string;
  codigo: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
}

const CAT_ITEMS = [
  { id: 'p-1', codigo: 'HER-001', nombre: 'Martillo de Uña Curva 16oz', precio: 245.00, stock: 24 },
  { id: 'p-2', codigo: 'CON-001', nombre: 'Cemento Bijao Gris 42.5kg', precio: 220.00, stock: 180 },
  { id: 'p-3', codigo: 'CON-002', nombre: 'Varilla Corrugada 3/8" (6m)', precio: 165.00, stock: 5 },
  { id: 'p-4', codigo: 'PLO-001', nombre: 'Tubo PVC Sanitario 4" x 6m', precio: 380.00, stock: 3 },
  { id: 'p-5', codigo: 'ELE-001', nombre: 'Cable THHN 12 AWG (100m)', precio: 1450.00, stock: 2 },
  { id: 'p-6', codigo: 'HER-002', nombre: 'Cinta Métrica 8m Truper', precio: 185.00, stock: 15 },
];

export const POSPage: React.FC = () => {
  const { tenant, user } = useTenant();

  const [cart, setCart] = useState<CartItem[]>([
    { productoId: 'p-1', codigo: 'HER-001', nombre: 'Martillo de Uña Curva 16oz', precioUnitario: 245.00, cantidad: 2 },
    { productoId: 'p-2', codigo: 'CON-001', nombre: 'Cemento Bijao Gris 42.5kg', precioUnitario: 220.00, cantidad: 5 },
  ]);

  const [search, setSearch] = useState('');
  const [clienteNombre, setClienteNombre] = useState('Consumidor Final');
  const [clienteRtn, setClienteRtn] = useState('');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA' | 'CREDITO'>('EFECTIVO');
  const [modalTicket, setModalTicket] = useState(false);
  const [numeroVentaGenerado, setNumeroVentaGenerado] = useState(1043);

  // Cálculos fiscales hondureños
  const subtotal = cart.reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0);
  const isv = Math.round(subtotal * 0.15 * 100) / 100;
  const total = subtotal + isv;

  const agregarAlCarrito = (prod: (typeof CAT_ITEMS)[0]) => {
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
          precioUnitario: prod.precio,
          cantidad: 1,
        },
      ]);
    }
  };

  const modificarCantidad = (productoId: string, delta: number) => {
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
    setCart(cart.filter((i) => i.productoId !== productoId));
  };

  const handleCobrar = () => {
    if (cart.length === 0) return;
    setNumeroVentaGenerado((prev) => prev + 1);
    setModalTicket(true);
  };

  return (
    <div style={styles.container}>
      <TopBar title="PUNTO DE VENTA (POS)" subtitle="Terminal de Caja Rápida" />

      <main style={styles.content}>
        {/* Layout en dos columnas: Izquierda catálogo rápido, Derecha Carrito & Cobro */}
        <div style={styles.posGrid}>
          {/* Columna Izquierda: Catálogo y Búsqueda */}
          <div style={styles.catalogColumn}>
            <div style={styles.searchBox}>
              <Search size={18} strokeWidth={2.4} style={styles.searchIcon} />
              <input
                type="text"
                placeholder="Escanear código de barras o teclear nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '38px', height: '46px', fontSize: '15px' }}
                autoFocus
              />
            </div>

            <div style={styles.catalogGrid}>
              {CAT_ITEMS.filter(
                (p) =>
                  p.nombre.toLowerCase().includes(search.toLowerCase()) ||
                  p.codigo.toLowerCase().includes(search.toLowerCase()),
              ).map((prod) => (
                <div
                  key={prod.id}
                  className="industrial-card"
                  style={styles.productCard}
                  onClick={() => agregarAlCarrito(prod)}
                >
                  <div style={styles.skuBadge}>{prod.codigo}</div>
                  <div style={styles.productName}>{prod.nombre}</div>
                  <div style={styles.priceRow}>
                    <span style={styles.priceText}>{formatLempiras(prod.precio)}</span>
                    <span style={styles.stockText}>{prod.stock} disp.</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Columna Derecha: Factura y Resumen */}
          <div className="industrial-card" style={styles.cartColumn}>
            {/* Cabecera del ticket */}
            <div style={styles.cartHeader}>
              <div style={styles.cartTitle}>ORDEN DE CAJA ACTUAL</div>
              <span className="badge badge-dark">ITEMS: {cart.length}</span>
            </div>

            {/* Selector de Cliente */}
            <div style={styles.clientSection}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={16} strokeWidth={2.4} color="var(--color-primary)" />
                <input
                  type="text"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  className="form-input"
                  style={{ padding: '6px 10px', fontSize: '12px', flex: 1 }}
                  placeholder="Nombre Cliente..."
                />
              </div>
              <input
                type="text"
                value={clienteRtn}
                onChange={(e) => setClienteRtn(e.target.value)}
                className="form-input"
                style={{ padding: '6px 10px', fontSize: '11px', marginTop: '6px' }}
                placeholder="RTN (Opcional para factura)..."
              />
            </div>

            {/* Lista de ítems en carrito */}
            <div style={styles.cartItemsList}>
              {cart.length === 0 ? (
                <div style={styles.emptyCart}>
                  <Receipt size={40} strokeWidth={1.5} color="#A8A29E" />
                  <p style={{ marginTop: '8px', fontWeight: 600 }}>El carrito está vacío</p>
                  <span style={{ fontSize: '12px', color: '#78716C' }}>
                    Seleccione productos del catálogo
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
                      style={styles.deleteBtn}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Totales Fiscales */}
            <div style={styles.totalsSection}>
              <div style={styles.totalRow}>
                <span style={styles.totalLabel}>SUBTOTAL:</span>
                <span style={styles.totalVal}>{formatLempiras(subtotal)}</span>
              </div>
              <div style={styles.totalRow}>
                <span style={styles.totalLabel}>ISV (15%):</span>
                <span style={styles.totalVal}>{formatLempiras(isv)}</span>
              </div>
              <div style={{ ...styles.totalRow, ...styles.grandTotalRow }}>
                <span style={styles.grandTotalLabel}>TOTAL A PAGAR:</span>
                <span style={styles.grandTotalVal}>{formatLempiras(total)}</span>
              </div>
            </div>

            {/* Método de Pago */}
            <div style={styles.paymentMethods}>
              <button
                type="button"
                onClick={() => setMetodoPago('EFECTIVO')}
                style={{
                  ...styles.payBtn,
                  ...(metodoPago === 'EFECTIVO' ? styles.payBtnActive : {}),
                }}
              >
                <Banknote size={16} strokeWidth={2.5} /> EFECTIVO
              </button>
              <button
                type="button"
                onClick={() => setMetodoPago('TARJETA')}
                style={{
                  ...styles.payBtn,
                  ...(metodoPago === 'TARJETA' ? styles.payBtnActive : {}),
                }}
              >
                <CreditCard size={16} strokeWidth={2.5} /> TARJETA
              </button>
            </div>

            {/* Botón de Cobro Final */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCobrar}
              disabled={cart.length === 0}
              style={{ ...styles.checkoutBtn, opacity: cart.length === 0 ? 0.5 : 1 }}
            >
              <CheckCircle size={20} strokeWidth={2.5} />
              <span>COBRAR {formatLempiras(total)}</span>
            </button>
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
                <div style={styles.ticketMeta}>RTN: 05019002345678 • Tel: +504 2550-1234</div>
                <div style={styles.ticketMeta}>Honduras • Moneda: Lempiras (HNL)</div>
              </div>

              <div style={styles.ticketDashed} />

              <div style={styles.ticketFacturaMeta}>
                <div><strong>COMPROBANTE DE VENTA</strong></div>
                <div>Factura N°: <strong>V-{numeroVentaGenerado}</strong></div>
                <div>Fecha: 25/09/2026 01:25 PM</div>
                <div>Cajero: {user?.nombre || 'Carlos Ramos'}</div>
                <div>Cliente: {clienteNombre}</div>
                {clienteRtn && <div>RTN Cliente: {clienteRtn}</div>}
              </div>

              <div style={styles.ticketDashed} />

              <table style={styles.ticketTable}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>DESCRIPCIÓN</th>
                    <th style={{ textAlign: 'center' }}>CANT</th>
                    <th style={{ textAlign: 'right' }}>TOTAL</th>
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
                <div>Subtotal: {formatLempiras(subtotal)}</div>
                <div>ISV (15%): {formatLempiras(isv)}</div>
                <div style={{ fontSize: '15px', fontWeight: 900, marginTop: '4px' }}>
                  TOTAL PAGADO: {formatLempiras(total)}
                </div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>
                  Método de Pago: {metodoPago}
                </div>
              </div>

              <div style={styles.ticketDashed} />

              <div style={{ textAlign: 'center', fontSize: '10px', color: '#78716C', marginTop: '10px' }}>
                ¡Gracias por su compra! • FerreSystem
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => window.print()}
                style={{ flex: 1 }}
              >
                <Printer size={16} strokeWidth={2.4} /> IMPRIMIR TICKET
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setModalTicket(false);
                  setCart([]);
                }}
                style={{ flex: 1 }}
              >
                NUEVA VENTA
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
    color: '#78716C',
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
    color: '#78716C',
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
    color: '#78716C',
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
    color: '#78716C',
  },
  cartItemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    backgroundColor: '#FAFAF9',
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
    color: '#78716C',
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
    color: '#78716C',
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
    borderBottom: '1px dashed #78716C',
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
