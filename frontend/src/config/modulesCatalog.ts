export interface ModuleDefinition {
  key: string;
  labelKey: string;
  nombre: string;
  descripcion: string;
  categoria: 'OPERACION' | 'INVENTARIO' | 'CLIENTES' | 'GESTION' | 'ANALISIS' | 'CONFIGURACION';
  isCore?: boolean;
}

export const CATALOGO_MODULOS: ModuleDefinition[] = [
  {
    key: 'pos',
    labelKey: 'menu.pos',
    nombre: 'Punto de Venta (POS)',
    descripcion: 'Facturación rápida en mostrador, cálculo de cambio y cierre de tickets',
    categoria: 'OPERACION',
  },
  {
    key: 'cotizaciones',
    labelKey: 'menu.quotations',
    nombre: 'Cotizaciones / Proformas',
    descripcion: 'Presupuestos para clientes, validez, cálculo de ISV y conversión a venta',
    categoria: 'OPERACION',
  },
  {
    key: 'pedidos_especiales',
    labelKey: 'menu.special_orders',
    nombre: 'Pedidos Especiales / Backorder',
    descripcion: 'Encargos de mercadería sin stock inmediato y seguimiento de avisos',
    categoria: 'OPERACION',
  },
  {
    key: 'apartados',
    labelKey: 'menu.layaway',
    nombre: 'Apartados / Layaway',
    descripcion: 'Reserva de productos con abonos parciales y vencimientos',
    categoria: 'OPERACION',
  },
  {
    key: 'inventario',
    labelKey: 'menu.inventory',
    nombre: 'Inventario / Catálogo',
    descripcion: 'Gestión de productos, stock mínimo, kardex y unidades de medida',
    categoria: 'INVENTARIO',
  },
  {
    key: 'levantamiento',
    labelKey: 'menu.stock_taking',
    nombre: 'Levantamiento de Inventario',
    descripcion: 'Herramienta ligera offline para conteo físico inicial de productos desde celular',
    categoria: 'INVENTARIO',
  },
  {
    key: 'ordenes_compra',
    labelKey: 'menu.purchase_orders',
    nombre: 'Órdenes de Compra & Proveedores',
    descripcion: 'Generación de pedidos a proveedores y recepción de mercadería',
    categoria: 'INVENTARIO',
  },
  {
    key: 'transferencias_sucursal',
    labelKey: 'menu.transfers',
    nombre: 'Transferencias Inter-Sucursal',
    descripcion: 'Movimiento y despacho de stock entre distintas sedes o bodegas',
    categoria: 'INVENTARIO',
  },
  {
    key: 'garantias',
    labelKey: 'menu.warranties',
    nombre: 'Garantías & Números de Serie',
    descripcion: 'Seguimiento por S/N de herramientas, reclamos y estados de soporte',
    categoria: 'INVENTARIO',
  },
  {
    key: 'clientes',
    labelKey: 'menu.clients',
    nombre: 'Directorio de Clientes & RTN',
    descripcion: 'Gestión de clientes, datos fiscales, RTN y clasificación comercial',
    categoria: 'CLIENTES',
  },
  {
    key: 'listas_precio',
    labelKey: 'menu.price_lists',
    nombre: 'Listas de Precio / Segmentos',
    descripcion: 'Precios diferenciados por mayorista, contratista y consumidor final',
    categoria: 'CLIENTES',
  },
  {
    key: 'usuarios',
    labelKey: 'menu.users',
    nombre: 'Gestión de Usuarios & Roles',
    descripcion: 'Control de cajeros, vendedores, bodegueros y permisos individuales',
    categoria: 'GESTION',
  },
  {
    key: 'comisiones_venta',
    labelKey: 'menu.commissions',
    nombre: 'Comisiones de Venta',
    descripcion: 'Cálculo de incentivos e impositivos por vendedor y meta cumplida',
    categoria: 'GESTION',
  },
  {
    key: 'arqueo_caja',
    labelKey: 'menu.cash_drawer',
    nombre: 'Arqueo & Cierre de Caja',
    descripcion: 'Conteo físico de efectivo, cierres por turno y discrepancias',
    categoria: 'GESTION',
  },
  {
    key: 'contabilidad',
    labelKey: 'menu.accounting',
    nombre: 'Contabilidad y Control Tributario (Honduras)',
    descripcion: 'Libros de ventas y compras, ISV, retenciones, RTN, CAI, períodos, conciliación y partida doble. Se habilita por empresa.',
    categoria: 'GESTION',
  },
  {
    key: 'reportes',
    labelKey: 'menu.reports',
    nombre: 'Módulo de Reportes & KPIs',
    descripcion: 'Análisis gerencial de ventas, rotación de inventario y utilidad',
    categoria: 'ANALISIS',
  },
  {
    key: 'configuracion',
    labelKey: 'menu.configuration',
    nombre: 'Configuración / Marca',
    descripcion: 'Personalización de colores, logos, datos fiscales y estilos de UI',
    categoria: 'CONFIGURACION',
  },
];

// Opcionales: sin registro habilitado quedan apagados (igual que OPT_IN_TENANT_MODULES del backend).
export const OPT_IN_MODULES = new Set(['contabilidad']);
/** Módulos que se suponen activos cuando el servidor no envía la lista (compatibilidad con sesiones antiguas). */
export const modulosPorDefecto = () => CATALOGO_MODULOS.map(m => m.key).filter(k => !OPT_IN_MODULES.has(k) && !PENDING_MODULES.has(k));

export const PENDING_MODULES = new Set(['apartados', 'transferencias_sucursal', 'pedidos_especiales', 'listas_precio', 'comisiones_venta']);
/** Módulos que el backend acepta en PUT /modules (sin los pendientes, que lo rechaza con 400). */
export const MODULOS_CONTRATABLES = CATALOGO_MODULOS.filter(m => !PENDING_MODULES.has(m.key));

export const MODULE_DEPENDENCIES: Record<string, string[]> = {
  pos: ['inventario', 'arqueo_caja', 'clientes'], cotizaciones: ['inventario', 'clientes'],
  levantamiento: ['inventario'], ordenes_compra: ['inventario'], comisiones_venta: ['pos', 'usuarios'],
};
