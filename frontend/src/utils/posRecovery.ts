export interface CartItem {
  productoId: string;
  codigo: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  sinInventario?: boolean;
  proveedorId?: string;
}

export interface SaleDraft {
  modoEntrega?: 'MOSTRADOR' | 'BODEGA';
  cart: CartItem[];
  clienteNombre: string;
  clienteRtn: string;
  clienteId?: string;
  vencimiento?: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'CREDITO' | 'TRANSFERENCIA';
  descuentoPorcentaje: number;
}

export interface PendingSale extends SaleDraft { solicitudId: string }

const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
const validDraft = (sale: SaleDraft) => sale && Array.isArray(sale.cart) && sale.cart.length > 0 &&
  sale.cart.every(item => item && typeof item.productoId === 'string' && typeof item.codigo === 'string' &&
    typeof item.nombre === 'string' && Number.isFinite(item.cantidad) && item.cantidad > 0 &&
    Number.isFinite(item.precioUnitario) && item.precioUnitario >= 0 &&
    (item.sinInventario === undefined || typeof item.sinInventario === 'boolean') &&
    optionalString(item.proveedorId) && (!item.sinInventario || !!item.proveedorId)) &&
  typeof sale.clienteNombre === 'string' && typeof sale.clienteRtn === 'string' &&
  optionalString(sale.clienteId) && optionalString(sale.vencimiento) &&
  (sale.modoEntrega === undefined || sale.modoEntrega === 'MOSTRADOR' || sale.modoEntrega === 'BODEGA') &&
  ['EFECTIVO', 'TARJETA', 'CREDITO', 'TRANSFERENCIA'].includes(sale.metodoPago) &&
  Number.isFinite(sale.descuentoPorcentaje) && sale.descuentoPorcentaje >= 0 && sale.descuentoPorcentaje <= 100;

export function readRecovery(pendingKey: string, draftKey: string) {
  try {
    const rawPending = localStorage.getItem(pendingKey);
    const pending: PendingSale | null = rawPending ? JSON.parse(rawPending) : null;
    // Un pendiente inválido no se descarta ni se reemplaza por otra operación.
    if (rawPending && (!pending || !validDraft(pending) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pending.solicitudId))) {
      return { pending: null, draft: null, error: 'No se pudo recuperar la venta pendiente. Pida al administrador revisar las ventas antes de volver a cobrar.' };
    }
    const rawDraft = pending ? null : localStorage.getItem(draftKey);
    const envelope = rawDraft ? JSON.parse(rawDraft) : null;
    if (rawDraft && (envelope?.version !== 1 || !validDraft(envelope.sale))) {
      return { pending: null, draft: null, error: 'No se pudo leer el borrador guardado. Pida ayuda al administrador para recuperarlo.' };
    }
    return { pending, draft: (envelope?.sale ?? null) as SaleDraft | null, error: null };
  } catch {
    return { pending: null, draft: null, error: 'No se pudo acceder a la recuperación guardada. Pida ayuda al administrador antes de cobrar.' };
  }
}

export function saveDraft(key: string, sale: SaleDraft) {
  if (sale.cart.length) {
    if (!validDraft(sale)) throw new Error('Datos de borrador inválidos');
    localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), sale }));
  }
  else localStorage.removeItem(key);
}
