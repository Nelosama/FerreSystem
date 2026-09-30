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
    isCore: true,
  },
];
