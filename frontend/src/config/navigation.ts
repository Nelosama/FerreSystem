import {
  LayoutGrid,
  PackageSearch,
  Calculator,
  ClipboardList,
  Sliders,
  ShieldCheck,
  Bookmark,
  DollarSign,
  Truck,
  GitBranch,
  Shield,
  Clock,
  Tags,
  Percent,
  BarChart3,
  Smartphone,
  Users,
} from 'lucide-react';

export interface NavigationItem {
  key: string;
  labelKey: string;
  defaultLabel: string;
  route: string;
  icon: any;
  moduleKey?: string;
  allowedRoles?: string[];
  requiredPermiso?: string;
  category: 'OPERACION' | 'INVENTARIO' | 'CLIENTES' | 'GESTION' | 'ANALISIS' | 'CONFIGURACION' | 'SYSTEM';
  exact?: boolean;
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  // SYSTEM / SUPER ADMIN
  {
    key: 'superadmin',
    labelKey: 'menu.super_admin',
    defaultLabel: 'SUPER ADMIN',
    route: '/admin',
    icon: ShieldCheck,
    allowedRoles: ['SUPERADMIN'],
    category: 'SYSTEM',
  },

  // OPERACION
  {
    key: 'dashboard',
    labelKey: 'menu.dashboard',
    defaultLabel: 'DASHBOARD',
    route: '/',
    icon: LayoutGrid,
    exact: true,
    allowedRoles: ['ADMIN', 'CAJERO', 'BODEGUERO', 'VENDEDOR'],
    category: 'OPERACION',
  },
  {
    key: 'pos',
    labelKey: 'menu.pos',
    defaultLabel: 'PUNTO DE VENTA (POS)',
    route: '/pos',
    icon: Calculator,
    moduleKey: 'pos',
    allowedRoles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
    category: 'OPERACION',
  },
  {
    key: 'cotizaciones',
    labelKey: 'menu.quotations',
    defaultLabel: 'COTIZACIONES',
    route: '/cotizaciones',
    icon: ClipboardList,
    moduleKey: 'cotizaciones',
    allowedRoles: ['ADMIN', 'VENDEDOR', 'CAJERO'],
    category: 'OPERACION',
  },
  {
    key: 'pedidos_especiales',
    labelKey: 'menu.special_orders',
    defaultLabel: 'PEDIDOS ESPECIALES',
    route: '/pedidos-especiales',
    icon: Clock,
    moduleKey: 'pedidos_especiales',
    allowedRoles: ['ADMIN', 'VENDEDOR', 'CAJERO'],
    category: 'OPERACION',
  },
  {
    key: 'apartados',
    labelKey: 'menu.layaway',
    defaultLabel: 'APARTADOS',
    route: '/apartados',
    icon: Bookmark,
    moduleKey: 'apartados',
    allowedRoles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
    category: 'OPERACION',
  },

  {key:'auditoria',labelKey:'menu.audit',defaultLabel:'AUDITORÍA',route:'/auditoria',icon:ClipboardList,allowedRoles:['ADMIN'],category:'ANALISIS'},
  {key:'devoluciones',labelKey:'menu.returns',defaultLabel:'DEVOLUCIONES',route:'/devoluciones',moduleKey:'pos',icon:PackageSearch,allowedRoles:['ADMIN','CAJERO','VENDEDOR'],category:'OPERACION'},
  {key:'cuentas',labelKey:'menu.accounts',defaultLabel:'CUENTAS Y ABONOS',route:'/cuentas',icon:DollarSign,allowedRoles:['ADMIN','CAJERO'],category:'CLIENTES'},
  {key:'entregas',labelKey:'menu.deliveries',defaultLabel:'ENTREGAS',route:'/entregas',moduleKey:'pos',icon:Truck,allowedRoles:['ADMIN','CAJERO','BODEGUERO'],category:'OPERACION'},

  // INVENTARIO
  {
    key: 'inventario',
    labelKey: 'menu.inventory',
    defaultLabel: 'INVENTARIO',
    route: '/inventario',
    icon: PackageSearch,
    moduleKey: 'inventario',
    allowedRoles: ['ADMIN', 'BODEGUERO'],
    category: 'INVENTARIO',
  },
  {
    key: 'precios',
    labelKey: 'menu.prices',
    defaultLabel: 'PRECIOS Y APROBACIÓN',
    route: '/precios',
    icon: Tags,
    allowedRoles: ['ADMIN'],
    category: 'INVENTARIO',
  },
  {
    key: 'levantamiento',
    labelKey: 'menu.stock_taking',
    defaultLabel: 'LEVANTAMIENTO',
    route: '/levantamiento',
    icon: ClipboardList,
    moduleKey: 'levantamiento',
    allowedRoles: ['ADMIN', 'BODEGUERO'],
    category: 'INVENTARIO',
  },
  {
    key: 'ordenes_compra',
    labelKey: 'menu.purchase_orders',
    defaultLabel: 'ÓRDENES DE COMPRA',
    route: '/ordenes-compra',
    icon: Truck,
    moduleKey: 'ordenes_compra',
    allowedRoles: ['ADMIN', 'BODEGUERO'],
    category: 'INVENTARIO',
  },
  {
    key: 'transferencias',
    labelKey: 'menu.transfers',
    defaultLabel: 'TRANSFERENCIAS',
    route: '/transferencias',
    icon: GitBranch,
    moduleKey: 'transferencias_sucursal',
    allowedRoles: ['ADMIN', 'BODEGUERO'],
    category: 'INVENTARIO',
  },
  {
    key: 'garantias',
    labelKey: 'menu.warranties',
    defaultLabel: 'GARANTÍAS',
    route: '/garantias',
    icon: Shield,
    moduleKey: 'garantias',
    // Igual que GET/POST /garantias en el backend: el vendedor no consulta coberturas (FS-14 en garantías).
    allowedRoles: ['ADMIN', 'CAJERO'],
    category: 'INVENTARIO',
  },

  // Conciliación del POS bancario: solo ADMIN (las tarjetas las registra el cajero en la venta).
  {
    key: 'conciliacion_bancaria',
    labelKey: 'menu.bank_reconciliation',
    defaultLabel: 'CONCILIACIÓN BANCARIA',
    route: '/conciliacion-bancaria',
    icon: Smartphone,
    allowedRoles: ['ADMIN'],
    category: 'ANALISIS',
  },
  // CLIENTES
  {
    key: 'estado_cuenta_clientes',
    labelKey: 'menu.customer_statement',
    defaultLabel: 'ESTADO DE CUENTA',
    route: '/estado-cuenta-clientes',
    icon: Users,
    allowedRoles: ['ADMIN'],
    category: 'CLIENTES',
  },
  {
    key: 'clientes',
    labelKey: 'menu.clients',
    defaultLabel: 'CLIENTES',
    route: '/clientes',
    icon: Users,
    allowedRoles: ['ADMIN'],
    category: 'CLIENTES',
  },
  {
    key: 'listas_precio',
    labelKey: 'menu.price_lists',
    defaultLabel: 'LISTAS DE PRECIO',
    route: '/listas-precio',
    icon: Tags,
    moduleKey: 'listas_precio',
    allowedRoles: ['ADMIN', 'VENDEDOR'],
    category: 'CLIENTES',
  },

  // GESTION
  {
    key: 'usuarios',
    labelKey: 'menu.users',
    defaultLabel: 'USUARIOS',
    route: '/usuarios',
    icon: Users,
    moduleKey: 'usuarios',
    allowedRoles: ['ADMIN'],
    category: 'GESTION',
  },
  {
    key: 'comisiones',
    labelKey: 'menu.commissions',
    defaultLabel: 'COMISIONES',
    route: '/comisiones',
    icon: Percent,
    moduleKey: 'comisiones_venta',
    allowedRoles: ['ADMIN'],
    category: 'GESTION',
  },
  {
    key: 'arqueo_caja',
    labelKey: 'menu.cash_drawer',
    defaultLabel: 'ARQUEO DE CAJA',
    route: '/arqueo-caja',
    icon: DollarSign,
    allowedRoles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
    category: 'OPERACION',
  },

  // ANALISIS
  {
    key: 'reportes',
    labelKey: 'menu.reports',
    defaultLabel: 'REPORTES & KPIS',
    route: '/reportes',
    icon: BarChart3,
    moduleKey: 'reportes',
    allowedRoles: ['ADMIN'],
    requiredPermiso: 'reportes.ver',
    category: 'ANALISIS',
  },
  // Resumen administrativo para iPhone: solo lectura de datos ya operativos (ventas, caja, existencias, cobros).
  {
    key: 'admin_movil',
    labelKey: 'menu.mobile_admin',
    defaultLabel: 'RESUMEN MÓVIL',
    route: '/admin-movil',
    icon: Smartphone,
    allowedRoles: ['ADMIN'],
    category: 'ANALISIS',
  },

  // CONFIGURACION
  {
    key: 'configuracion',
    labelKey: 'menu.configuration',
    defaultLabel: 'CONFIGURACIÓN',
    route: '/configuracion',
    icon: Sliders,
    allowedRoles: ['ADMIN'],
    moduleKey: 'configuracion',
    category: 'CONFIGURACION',
  },
];


export const NAVIGATION_CATEGORIES = ['SYSTEM', 'OPERACION', 'INVENTARIO', 'CLIENTES', 'GESTION', 'ANALISIS', 'CONFIGURACION'] as const;
export const ROLE_PRIORITIES: Record<string, string[]> = {
  SUPERADMIN: ['superadmin'], ADMIN: ['ordenes_compra', 'inventario', 'usuarios', 'reportes'],
  CAJERO: ['arqueo_caja', 'pos', 'cuentas'],
  VENDEDOR: ['pos', 'cotizaciones', 'arqueo_caja'],
  BODEGUERO: ['entregas', 'inventario', 'ordenes_compra', 'levantamiento'],
};
