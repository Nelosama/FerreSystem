import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ProductItem, QuotationItem, QuotationDetailItem } from '../types';
import { Rubro } from '../types';
import { RUBROS_CONFIG_LOCALIZED } from '../config/rubros';
import { useTenant } from './TenantContext';

export type { ProductItem, QuotationItem, QuotationDetailItem };

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rolBase: 'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR';
  permisos: string[];
  descuentoMaximo: number;
  activo: boolean;
  sucursalActual?: string;
}

export interface SaleRecord {
  id: string;
  numeroVenta: number;
  clienteNombre: string;
  clienteRtn?: string;
  vendedorNombre?: string;
  subtotal: number;
  isv: number;
  total: number;
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'CREDITO';
  fecha: string;
  items: Array<{
    productoId: string;
    nombre: string;
    precioUnitario: number;
    cantidad: number;
    categoria?: string;
  }>;
}

export const PERMISOS_DEFAULT_POR_ROL: Record<'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR', { permisos: string[]; descuentoMaximo: number }> = {
  ADMIN: {
    permisos: [
      'pos.vender',
      'pos.anular_venta',
      'pos.aplicar_descuento',
      'inventario.ver',
      'inventario.editar',
      'cotizaciones.crear',
      'cotizaciones.aprobar',
      'cotizaciones.convertir_venta',
      'reportes.ver',
      'usuarios.gestionar',
      'configuracion.editar',
    ],
    descuentoMaximo: 100,
  },
  CAJERO: {
    permisos: ['pos.vender', 'pos.aplicar_descuento', 'inventario.ver'],
    descuentoMaximo: 10,
  },
  BODEGUERO: {
    permisos: ['inventario.ver', 'inventario.editar'],
    descuentoMaximo: 0,
  },
  VENDEDOR: {
    permisos: [
      'pos.vender',
      'cotizaciones.crear',
      'cotizaciones.aprobar',
      'cotizaciones.convertir_venta',
      'pos.aplicar_descuento',
    ],
    descuentoMaximo: 15,
  },
};

interface MockDataContextType {
  productos: ProductItem[];
  cotizaciones: QuotationItem[];
  ventas: SaleRecord[];
  usuarios: Usuario[];
  agregarProducto: (producto: Omit<ProductItem, 'id'>) => ProductItem;
  agregarCotizacion: (cotizacion: Omit<QuotationItem, 'id' | 'numero'>) => QuotationItem;
  actualizarCotizacion: (id: string, cotizacionData: Partial<QuotationItem>) => void;
  duplicarCotizacion: (id: string, usuarioNombre?: string) => QuotationItem;
  actualizarEstadoCotizacion: (id: string, estado: QuotationItem['estado']) => void;
  convertirCotizacionAVenta: (cotizacionId: string) => void;
  registrarVenta: (venta: Omit<SaleRecord, 'id' | 'numeroVenta' | 'fecha'>) => SaleRecord;
  agregarUsuario: (usuario: Omit<Usuario, 'id'>) => Usuario;
  actualizarUsuario: (id: string, data: Partial<Omit<Usuario, 'id'>>) => void;
}

const INITIAL_PRODUCTOS: ProductItem[] = [
  {
    id: 'p-alz-1',
    codigo: 'ALZ-040-HG',
    nombre: 'Aluzinc natural 0.40 mm HG',
    descripcion: 'Lámina de aluzinc galvanizado para techos y cubiertas industriales',
    categoria: 'Construcción',
    precioVenta: 39.00,
    precioCosto: 28.50,
    stockActual: 150,
    stockMinimo: 30,
    unidadMedida: 'PIE',
    usaMedida: true,
    activo: true,
    stockBajo: false,
  },
  {
    id: 'p-clv-1',
    codigo: 'CLV-001',
    nombre: 'Clavos de Acero Concreto 2.5"',
    descripcion: 'Clavos galvanizados para fijación en concreto y mampostería',
    categoria: 'Fijación',
    precioVenta: 19.13,
    precioCosto: 12.00,
    stockActual: 500,
    stockMinimo: 100,
    unidadMedida: 'UNIDAD',
    usaMedida: false,
    activo: true,
    stockBajo: false,
  },
  {
    id: 'p-1',
    codigo: 'HER-001',
    nombre: 'Martillo de Uña Curva 16oz Stanley',
    descripcion: 'Martillo mango de fibra de vidrio alta resistencia',
    categoria: 'Herramientas',
    precioVenta: 245.00,
    precioCosto: 160.00,
    stockActual: 24,
    stockMinimo: 8,
    unidadMedida: 'UNIDAD',
    usaMedida: false,
    activo: true,
    stockBajo: false,
  },
  {
    id: 'p-2',
    codigo: 'CON-001',
    nombre: 'Cemento Bijao Gris Uso General 42.5kg',
    descripcion: 'Saco de cemento gris para obra negra y morteros',
    categoria: 'Construcción',
    precioVenta: 220.00,
    precioCosto: 185.00,
    stockActual: 180,
    stockMinimo: 50,
    unidadMedida: 'UNIDAD',
    usaMedida: false,
    activo: true,
    stockBajo: false,
  },
  {
    id: 'p-3',
    codigo: 'CON-002',
    nombre: 'Varilla Corrugada 3/8" Grado 40 (6m)',
    descripcion: 'Acero de refuerzo legítimo para cimentaciones',
    categoria: 'Construcción',
    precioVenta: 165.00,
    precioCosto: 130.00,
    stockActual: 5,
    stockMinimo: 40,
    unidadMedida: 'UNIDAD',
    usaMedida: false,
    activo: true,
    stockBajo: true,
  },
  {
    id: 'p-4',
    codigo: 'PLO-001',
    nombre: 'Tubo PVC Sanitario 4" x 6m Durman',
    descripcion: 'Tubo de drenaje sanitario estándar',
    categoria: 'Plomería',
    precioVenta: 380.00,
    precioCosto: 275.00,
    stockActual: 3,
    stockMinimo: 15,
    unidadMedida: 'METRO',
    usaMedida: true,
    activo: true,
    stockBajo: true,
  },
  {
    id: 'p-5',
    codigo: 'ELE-001',
    nombre: 'Cable THHN Calibre 12 AWG Rollo 100m',
    descripcion: 'Conductor eléctrico de cobre multifilar',
    categoria: 'Electricidad',
    precioVenta: 1450.00,
    precioCosto: 1100.00,
    stockActual: 2,
    stockMinimo: 10,
    unidadMedida: 'UNIDAD',
    usaMedida: false,
    activo: true,
    stockBajo: true,
  },
  {
    id: 'p-6',
    codigo: 'HER-002',
    nombre: 'Cinta Métrica 8m / 26ft Truper Grip',
    descripcion: 'Flexómetro de impacto doble escala',
    categoria: 'Herramientas',
    precioVenta: 185.00,
    precioCosto: 115.00,
    stockActual: 15,
    stockMinimo: 6,
    unidadMedida: 'UNIDAD',
    usaMedida: false,
    activo: true,
    stockBajo: false,
  },
];

const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const daysAgoFormatted = (days: number) => {
  const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const INITIAL_COTIZACIONES: QuotationItem[] = [
  {
    id: 'cot-1',
    numero: 12,
    numeroCotizacion: 12,
    cliente: 'Constructora del Norte S. de R.L.',
    rtn: '05019001234567',
    telefono: '+504 9876-5432',
    email: 'compras@constructoranorte.hn',
    direccion: 'Zona Industrial Choloma, Cortés',
    usuarioNombre: 'Carlos Ramos (Admin Ferretería)',
    fechaEmision: daysAgoFormatted(2),
    fechaValidez: daysAgoFormatted(-13),
    diasValidez: 15,
    condicionesPago: 'Contado / Transferencia',
    subtotal: 16333.26,
    descuentoGeneral: 0,
    tipoDescuentoGeneral: 'MONTO',
    porcentajeIsv: 15,
    isv: 2449.99,
    descuento: 0,
    total: 18783.25,
    estado: 'APROBADA',
    itemsCount: 2,
    notas: 'Entregar en predio de obra principal San Pedro Sula',
    detalles: [
      {
        id: 'det-1',
        productoId: 'p-alz-1',
        codigoProducto: 'ALZ-040-HG',
        descripcionProducto: 'Aluzinc natural 0.40 mm HG',
        unidadMedida: 'PIE',
        usaMedida: true,
        cantidad: 9,
        medida: 14,
        totalMedida: 126,
        precioLista: 39.00,
        precioUnitario: 39.00,
        descuento: 0,
        tipoDescuento: 'MONTO',
        exento: false,
        subtotal: 4914.00,
        isv: 737.10,
        totalLinea: 5651.10,
      },
      {
        id: 'det-2',
        productoId: 'p-clv-1',
        codigoProducto: 'CLV-001',
        descripcionProducto: 'Clavos de Acero Concreto 2.5"',
        unidadMedida: 'UNIDAD',
        usaMedida: false,
        cantidad: 600,
        medida: 1,
        totalMedida: 600,
        precioLista: 19.13,
        precioUnitario: 19.0321,
        descuento: 0,
        tipoDescuento: 'MONTO',
        exento: false,
        subtotal: 11419.26,
        isv: 1712.89,
        totalLinea: 13132.15,
      },
    ],
  },
  {
    id: 'cot-2',
    numero: 11,
    numeroCotizacion: 11,
    cliente: 'Ferretería El Progreso (Subdistribuidor)',
    rtn: '05021980001234',
    telefono: '+504 2647-1122',
    usuarioNombre: 'Carlos Ramos (Cajero)',
    fechaEmision: daysAgoFormatted(12),
    fechaValidez: daysAgoFormatted(3),
    diasValidez: 15,
    condicionesPago: 'Crédito 15 días',
    subtotal: 8400.00,
    porcentajeIsv: 15,
    isv: 1260.00,
    descuento: 0,
    total: 9660.00,
    estado: 'ENVIADA',
    itemsCount: 2,
    detalles: [],
  },
  {
    id: 'cot-3',
    numero: 10,
    numeroCotizacion: 10,
    cliente: 'Ing. Roberto Flores',
    telefono: '+504 3311-2244',
    usuarioNombre: 'Carlos Ramos (Admin Ferretería)',
    fechaEmision: daysAgoFormatted(25),
    fechaValidez: daysAgoFormatted(-10),
    diasValidez: 15,
    condicionesPago: 'Contado',
    subtotal: 3200.00,
    porcentajeIsv: 15,
    isv: 480.00,
    descuento: 0,
    total: 3680.00,
    estado: 'BORRADOR',
    itemsCount: 3,
    detalles: [],
  },
  {
    id: 'cot-4',
    numero: 9,
    numeroCotizacion: 9,
    cliente: 'Inversiones Industriales Cortés',
    rtn: '05019003322114',
    usuarioNombre: 'Carlos Ramos (Admin Ferretería)',
    fechaEmision: daysAgoFormatted(45),
    fechaValidez: daysAgoFormatted(30),
    diasValidez: 15,
    condicionesPago: 'Crédito 30 días',
    subtotal: 45000.00,
    porcentajeIsv: 15,
    isv: 6750.00,
    descuento: 0,
    total: 51750.00,
    estado: 'ENVIADA',
    itemsCount: 8,
    detalles: [],
  },
  {
    id: 'cot-5',
    numero: 8,
    numeroCotizacion: 8,
    cliente: 'Taller Mecánico San José',
    rtn: '05011985004411',
    usuarioNombre: 'Carlos Ramos (Admin Ferretería)',
    fechaEmision: daysAgoFormatted(70),
    fechaValidez: daysAgoFormatted(55),
    diasValidez: 15,
    condicionesPago: 'Contado',
    subtotal: 6200.00,
    porcentajeIsv: 15,
    isv: 930.00,
    descuento: 0,
    total: 7130.00,
    estado: 'CONVERTIDA',
    itemsCount: 5,
    detalles: [],
  },
];

const INITIAL_VENTAS: SaleRecord[] = [
  // Mes 1 (Hoy - Hace 5 días)
  {
    id: 'v-1',
    numeroVenta: 1042,
    clienteNombre: 'Consumidor Final',
    vendedorNombre: 'Carlos Ramos (Cajero)',
    subtotal: 37026.09,
    isv: 5553.91,
    total: 42580.00,
    metodoPago: 'EFECTIVO',
    fecha: daysAgo(1),
    items: [
      {
        productoId: 'p-1',
        nombre: 'Martillo de Uña Curva 16oz Stanley',
        precioUnitario: 245.00,
        cantidad: 10,
        categoria: 'Herramientas',
      },
      {
        productoId: 'p-2',
        nombre: 'Cemento Bijao Gris Uso General 42.5kg',
        precioUnitario: 220.00,
        cantidad: 150,
        categoria: 'Construcción',
      },
      {
        productoId: 'p-clv-1',
        nombre: 'Clavos de Acero Concreto 2.5"',
        precioUnitario: 19.13,
        cantidad: 360,
        categoria: 'Fijación',
      },
    ],
  },
  {
    id: 'v-2',
    numeroVenta: 1041,
    clienteNombre: 'Constructora del Norte S. de R.L.',
    vendedorNombre: 'Ana Martínez (Vendedora)',
    subtotal: 12500.00,
    isv: 1875.00,
    total: 14375.00,
    metodoPago: 'CREDITO',
    fecha: daysAgo(4),
    items: [
      {
        productoId: 'p-alz-1',
        nombre: 'Aluzinc natural 0.40 mm HG',
        precioUnitario: 39.00,
        cantidad: 200,
        categoria: 'Construcción',
      },
      {
        productoId: 'p-3',
        nombre: 'Varilla Corrugada 3/8" Grado 40 (6m)',
        precioUnitario: 165.00,
        cantidad: 25,
        categoria: 'Construcción',
      },
    ],
  },

  // Mes 1 (Hace 12 - 20 días)
  {
    id: 'v-3',
    numeroVenta: 1040,
    clienteNombre: 'Taller Mecánico San José',
    vendedorNombre: 'Carlos Ramos (Admin Ferretería)',
    subtotal: 6200.00,
    isv: 930.00,
    total: 7130.00,
    metodoPago: 'TARJETA',
    fecha: daysAgo(15),
    items: [
      {
        productoId: 'p-6',
        nombre: 'Cinta Métrica 8m / 26ft Truper Grip',
        precioUnitario: 185.00,
        cantidad: 10,
        categoria: 'Herramientas',
      },
      {
        productoId: 'p-5',
        nombre: 'Cable THHN Calibre 12 AWG Rollo 100m',
        precioUnitario: 1450.00,
        cantidad: 3,
        categoria: 'Electricidad',
      },
    ],
  },
  {
    id: 'v-4',
    numeroVenta: 1039,
    clienteNombre: 'Inversiones Industriales Cortés',
    vendedorNombre: 'Ana Martínez (Vendedora)',
    subtotal: 28400.00,
    isv: 4260.00,
    total: 32660.00,
    metodoPago: 'CREDITO',
    fecha: daysAgo(22),
    items: [
      {
        productoId: 'p-2',
        nombre: 'Cemento Bijao Gris Uso General 42.5kg',
        precioUnitario: 220.00,
        cantidad: 100,
        categoria: 'Construcción',
      },
      {
        productoId: 'p-4',
        nombre: 'Tubo PVC Sanitario 4" x 6m Durman',
        precioUnitario: 380.00,
        cantidad: 16,
        categoria: 'Plomería',
      },
    ],
  },

  // Mes 2 (Hace 35 - 55 días)
  {
    id: 'v-5',
    numeroVenta: 1038,
    clienteNombre: 'Ferretería El Progreso',
    vendedorNombre: 'Carlos Ramos (Cajero)',
    subtotal: 18900.00,
    isv: 2835.00,
    total: 21735.00,
    metodoPago: 'EFECTIVO',
    fecha: daysAgo(38),
    items: [
      {
        productoId: 'p-1',
        nombre: 'Martillo de Uña Curva 16oz Stanley',
        precioUnitario: 245.00,
        cantidad: 20,
        categoria: 'Herramientas',
      },
      {
        productoId: 'p-clv-1',
        nombre: 'Clavos de Acero Concreto 2.5"',
        precioUnitario: 19.13,
        cantidad: 500,
        categoria: 'Fijación',
      },
    ],
  },
  {
    id: 'v-6',
    numeroVenta: 1037,
    clienteNombre: 'Ing. Roberto Flores',
    vendedorNombre: 'Ana Martínez (Vendedora)',
    subtotal: 15600.00,
    isv: 2340.00,
    total: 17940.00,
    metodoPago: 'TARJETA',
    fecha: daysAgo(48),
    items: [
      {
        productoId: 'p-alz-1',
        nombre: 'Aluzinc natural 0.40 mm HG',
        precioUnitario: 39.00,
        cantidad: 300,
        categoria: 'Construcción',
      },
      {
        productoId: 'p-6',
        nombre: 'Cinta Métrica 8m / 26ft Truper Grip',
        precioUnitario: 185.00,
        cantidad: 20,
        categoria: 'Herramientas',
      },
    ],
  },

  // Mes 3 (Hace 65 - 85 días)
  {
    id: 'v-7',
    numeroVenta: 1036,
    clienteNombre: 'Constructora del Norte S. de R.L.',
    vendedorNombre: 'Carlos Ramos (Admin Ferretería)',
    subtotal: 54000.00,
    isv: 8100.00,
    total: 62100.00,
    metodoPago: 'CREDITO',
    fecha: daysAgo(68),
    items: [
      {
        productoId: 'p-2',
        nombre: 'Cemento Bijao Gris Uso General 42.5kg',
        precioUnitario: 220.00,
        cantidad: 200,
        categoria: 'Construcción',
      },
      {
        productoId: 'p-3',
        nombre: 'Varilla Corrugada 3/8" Grado 40 (6m)',
        precioUnitario: 165.00,
        cantidad: 60,
        categoria: 'Construcción',
      },
    ],
  },
  {
    id: 'v-8',
    numeroVenta: 1035,
    clienteNombre: 'Consumidor Final',
    vendedorNombre: 'Carlos Ramos (Cajero)',
    subtotal: 8200.00,
    isv: 1230.00,
    total: 9430.00,
    metodoPago: 'EFECTIVO',
    fecha: daysAgo(82),
    items: [
      {
        productoId: 'p-5',
        nombre: 'Cable THHN Calibre 12 AWG Rollo 100m',
        precioUnitario: 1450.00,
        cantidad: 5,
        categoria: 'Electricidad',
      },
      {
        productoId: 'p-1',
        nombre: 'Martillo de Uña Curva 16oz Stanley',
        precioUnitario: 245.00,
        cantidad: 4,
        categoria: 'Herramientas',
      },
    ],
  },
];

const INITIAL_USUARIOS: Usuario[] = [
  {
    id: 'user-demo-admin',
    nombre: 'Carlos Ramos (Admin Ferretería)',
    email: 'admin@lamundial.hn',
    rolBase: 'ADMIN',
    permisos: PERMISOS_DEFAULT_POR_ROL.ADMIN.permisos,
    descuentoMaximo: 100,
    activo: true,
    sucursalActual: 'Sucursal Centro (Principal)',
  },
  {
    id: 'user-demo-1',
    nombre: 'Carlos Ramos (Cajero)',
    email: 'cajero@lamundial.hn',
    rolBase: 'CAJERO',
    permisos: PERMISOS_DEFAULT_POR_ROL.CAJERO.permisos,
    descuentoMaximo: 10,
    activo: true,
    sucursalActual: 'Sucursal Centro (Principal)',
  },
  {
    id: 'user-demo-bodeguero',
    nombre: 'Jorge Mendoza (Bodeguero)',
    email: 'bodega@lamundial.hn',
    rolBase: 'BODEGUERO',
    permisos: PERMISOS_DEFAULT_POR_ROL.BODEGUERO.permisos,
    descuentoMaximo: 0,
    activo: true,
    sucursalActual: 'Sucursal San Pedro (Norte)',
  },
  {
    id: 'user-demo-vendedor',
    nombre: 'Ana Martínez (Vendedora)',
    email: 'vendedor@lamundial.hn',
    rolBase: 'VENDEDOR',
    permisos: PERMISOS_DEFAULT_POR_ROL.VENDEDOR.permisos,
    descuentoMaximo: 15,
    activo: true,
    sucursalActual: 'Sucursal Choluteca (Sur)',
  },
];

function getInitialProductosForRubro(rubroKey?: string): ProductItem[] {
  const rubroEnum = (rubroKey || Rubro.FERRETERIA) as Rubro;
  const config = RUBROS_CONFIG_LOCALIZED[rubroEnum] || RUBROS_CONFIG_LOCALIZED[Rubro.FERRETERIA];
  const categorias = config.categoriasDefault.map((c) => c.es);
  const unidad = config.unidadesMedida[0]?.es || 'unidad';

  if (categorias.length === 0) {
    return [
      {
        id: `p-seed-1`,
        codigo: 'PRD-001',
        nombre: 'Producto Muestra 1',
        descripcion: 'Producto inicial de muestra',
        categoria: 'General',
        precioVenta: 100.00,
        precioCosto: 70.00,
        stockActual: 50,
        stockMinimo: 10,
        unidadMedida: unidad,
        usaMedida: false,
        activo: true,
        stockBajo: false,
      },
    ];
  }

  return categorias.slice(0, 3).map((cat, idx) => ({
    id: `p-seed-${idx + 1}`,
    codigo: `PRD-00${idx + 1}`,
    nombre: `Ejemplo ${cat}`,
    descripcion: `Producto de muestra para categoría ${cat}`,
    categoria: cat,
    precioVenta: (idx + 1) * 50 + 25,
    precioCosto: (idx + 1) * 35 + 10,
    stockActual: 20 + idx * 10,
    stockMinimo: 5,
    unidadMedida: unidad,
    usaMedida: false,
    activo: true,
    stockBajo: false,
  }));
}

function getInitialUsuariosForTenant(tenant: any): Usuario[] {
  return [
    {
      id: `usr-admin-${tenant?.id || 'new'}`,
      nombre: `Administrador (${tenant?.nombreComercial || 'Empresa'})`,
      email: tenant?.email || `admin@${tenant?.id || 'empresa'}.hn`,
      rolBase: 'ADMIN',
      permisos: PERMISOS_DEFAULT_POR_ROL.ADMIN.permisos,
      descuentoMaximo: 100,
      activo: true,
      sucursalActual: tenant?.sucursal || 'Sucursal Principal',
    },
  ];
}

const isDemoTenant = (id: string) => id === 'tenant-demo-1' || id === 't-1';

const MockDataContext = createContext<MockDataContextType | undefined>(undefined);

export const MockDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { tenant } = useTenant();
  const currentTenantId = tenant?.id || 'tenant-demo-1';
  const [loadedTenantId, setLoadedTenantId] = useState<string>(currentTenantId);

  const loadProductosForTenant = (tId: string, rubro?: string): ProductItem[] => {
    const saved = localStorage.getItem(`ferre_mock_productos_${tId}`);
    if (saved) return JSON.parse(saved);
    if (isDemoTenant(tId)) {
      const legacy = localStorage.getItem('ferre_mock_productos');
      return legacy ? JSON.parse(legacy) : INITIAL_PRODUCTOS;
    }
    return getInitialProductosForRubro(rubro);
  };

  const loadCotizacionesForTenant = (tId: string): QuotationItem[] => {
    const saved = localStorage.getItem(`ferre_mock_cotizaciones_${tId}`);
    if (saved) return JSON.parse(saved);
    if (isDemoTenant(tId)) {
      const legacy = localStorage.getItem('ferre_mock_cotizaciones');
      return legacy ? JSON.parse(legacy) : INITIAL_COTIZACIONES;
    }
    return [];
  };

  const loadVentasForTenant = (tId: string): SaleRecord[] => {
    const saved = localStorage.getItem(`ferre_mock_ventas_${tId}`);
    if (saved) return JSON.parse(saved);
    if (isDemoTenant(tId)) {
      const legacy = localStorage.getItem('ferre_mock_ventas');
      return legacy ? JSON.parse(legacy) : INITIAL_VENTAS;
    }
    return [];
  };

  const loadUsuariosForTenant = (tObj: any): Usuario[] => {
    const tId = tObj?.id || 'tenant-demo-1';
    const saved = localStorage.getItem(`ferre_users_${tId}`);
    if (saved) return JSON.parse(saved);
    if (isDemoTenant(tId)) {
      const legacy = localStorage.getItem('ferre_users');
      return legacy ? JSON.parse(legacy) : INITIAL_USUARIOS;
    }
    return getInitialUsuariosForTenant(tObj);
  };

  const [productos, setProductos] = useState<ProductItem[]>(() =>
    loadProductosForTenant(currentTenantId, tenant?.rubro),
  );

  const [cotizaciones, setCotizaciones] = useState<QuotationItem[]>(() =>
    loadCotizacionesForTenant(currentTenantId),
  );

  const [ventas, setVentas] = useState<SaleRecord[]>(() =>
    loadVentasForTenant(currentTenantId),
  );

  const [usuarios, setUsuarios] = useState<Usuario[]>(() =>
    loadUsuariosForTenant(tenant),
  );

  // Re-sync on tenant change
  useEffect(() => {
    if (loadedTenantId !== currentTenantId) {
      setProductos(loadProductosForTenant(currentTenantId, tenant?.rubro));
      setCotizaciones(loadCotizacionesForTenant(currentTenantId));
      setVentas(loadVentasForTenant(currentTenantId));
      setUsuarios(loadUsuariosForTenant(tenant));
      setLoadedTenantId(currentTenantId);
    }
  }, [currentTenantId, tenant, loadedTenantId]);

  // Persistence per tenant
  useEffect(() => {
    if (loadedTenantId === currentTenantId) {
      localStorage.setItem(`ferre_mock_productos_${currentTenantId}`, JSON.stringify(productos));
    }
  }, [productos, currentTenantId, loadedTenantId]);

  useEffect(() => {
    if (loadedTenantId === currentTenantId) {
      localStorage.setItem(`ferre_mock_cotizaciones_${currentTenantId}`, JSON.stringify(cotizaciones));
    }
  }, [cotizaciones, currentTenantId, loadedTenantId]);

  useEffect(() => {
    if (loadedTenantId === currentTenantId) {
      localStorage.setItem(`ferre_mock_ventas_${currentTenantId}`, JSON.stringify(ventas));
    }
  }, [ventas, currentTenantId, loadedTenantId]);

  useEffect(() => {
    if (loadedTenantId === currentTenantId) {
      localStorage.setItem(`ferre_users_${currentTenantId}`, JSON.stringify(usuarios));
    }
  }, [usuarios, currentTenantId, loadedTenantId]);

  const agregarProducto = (productoData: Omit<ProductItem, 'id'>): ProductItem => {
    const nuevo: ProductItem = {
      ...productoData,
      id: `p-${Date.now()}`,
    };
    setProductos((prev) => [nuevo, ...prev]);
    return nuevo;
  };

  const agregarCotizacion = (
    cotizacionData: Omit<QuotationItem, 'id' | 'numero'>,
  ): QuotationItem => {
    const maxNumero = cotizaciones.reduce((max, c) => (c.numero > max ? c.numero : max), 0);
    const nuevoNum = maxNumero + 1;
    const nueva: QuotationItem = {
      ...cotizacionData,
      id: `cot-${Date.now()}`,
      numero: nuevoNum,
      numeroCotizacion: nuevoNum,
    };

    // La creación de una cotización NO altera el stock de productos
    setCotizaciones((prev) => [nueva, ...prev]);
    return nueva;
  };

  const actualizarCotizacion = (id: string, cotizacionData: Partial<QuotationItem>) => {
    setCotizaciones((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...cotizacionData } : c)),
    );
  };

  const duplicarCotizacion = (id: string, usuarioNombre?: string): QuotationItem => {
    const orig = cotizaciones.find((c) => c.id === id);
    if (!orig) {
      throw new Error('Cotización no encontrada');
    }

    const maxNumero = cotizaciones.reduce((max, c) => (c.numero > max ? c.numero : max), 0);
    const nuevoNum = maxNumero + 1;

    const fechaVal = new Date();
    fechaVal.setDate(fechaVal.getDate() + (orig.diasValidez || 15));
    const day = fechaVal.getDate().toString().padStart(2, '0');
    const month = (fechaVal.getMonth() + 1).toString().padStart(2, '0');
    const year = fechaVal.getFullYear();
    const fechaValidezFormatted = `${day}/${month}/${year}`;

    const duplicada: QuotationItem = {
      ...orig,
      id: `cot-${Date.now()}`,
      numero: nuevoNum,
      numeroCotizacion: nuevoNum,
      estado: 'BORRADOR',
      fechaEmision: new Date().toLocaleDateString('es-HN'),
      fechaValidez: fechaValidezFormatted,
      usuarioNombre: usuarioNombre || orig.usuarioNombre || 'Usuario Sistema',
      notas: orig.notas ? `Copia de COT-${orig.numero.toString().padStart(4, '0')}. ${orig.notas}` : `Copia de COT-${orig.numero.toString().padStart(4, '0')}`,
    };

    setCotizaciones((prev) => [duplicada, ...prev]);
    return duplicada;
  };

  const actualizarEstadoCotizacion = (id: string, estado: QuotationItem['estado']) => {
    setCotizaciones((prev) =>
      prev.map((c) => (c.id === id ? { ...c, estado } : c)),
    );
  };

  const registrarVenta = (
    ventaData: Omit<SaleRecord, 'id' | 'numeroVenta' | 'fecha'>,
  ): SaleRecord => {
    const maxNumero = ventas.reduce((max, v) => (v.numeroVenta > max ? v.numeroVenta : max), 1042);
    const nuevaVenta: SaleRecord = {
      ...ventaData,
      id: `v-${Date.now()}`,
      numeroVenta: maxNumero + 1,
      fecha: new Date().toISOString(),
    };

    // Descontar stock de los productos vendidos
    setProductos((prevProductos) =>
      prevProductos.map((p) => {
        const itemVendido = ventaData.items.find((i) => i.productoId === p.id);
        if (itemVendido) {
          const nuevoStock = Math.max(0, p.stockActual - itemVendido.cantidad);
          return { ...p, stockActual: nuevoStock };
        }
        return p;
      }),
    );

    setVentas((prev) => [nuevaVenta, ...prev]);
    return nuevaVenta;
  };

  const convertirCotizacionAVenta = (cotizacionId: string) => {
    const cot = cotizaciones.find((c) => c.id === cotizacionId);
    if (!cot) return;

    // Actualizar estado de cotización a CONVERTIDA
    setCotizaciones((prev) =>
      prev.map((c) => (c.id === cotizacionId ? { ...c, estado: 'CONVERTIDA' } : c)),
    );

    // Preparar ítems para descontar stock
    const saleItems = (cot.detalles || []).map((d) => ({
      productoId: d.productoId,
      nombre: d.descripcionProducto,
      precioUnitario: d.precioUnitario,
      cantidad: d.cantidad,
    }));

    // Descontar stock e ingresar registro de venta oficial
    registrarVenta({
      clienteNombre: cot.cliente,
      clienteRtn: cot.rtn,
      subtotal: cot.subtotal,
      isv: cot.isv,
      total: cot.total,
      metodoPago: 'EFECTIVO',
      items: saleItems,
    });
  };

  const agregarUsuario = (usuarioData: Omit<Usuario, 'id'>): Usuario => {
    const nuevo: Usuario = {
      ...usuarioData,
      id: `usr-${Date.now()}`,
    };
    setUsuarios((prev) => [nuevo, ...prev]);
    return nuevo;
  };

  const actualizarUsuario = (id: string, data: Partial<Omit<Usuario, 'id'>>) => {
    setUsuarios((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...data } : u)),
    );
  };

  return (
    <MockDataContext.Provider
      value={{
        productos,
        cotizaciones,
        ventas,
        usuarios,
        agregarProducto,
        agregarCotizacion,
        actualizarCotizacion,
        duplicarCotizacion,
        actualizarEstadoCotizacion,
        convertirCotizacionAVenta,
        registrarVenta,
        agregarUsuario,
        actualizarUsuario,
      }}
    >
      {children}
    </MockDataContext.Provider>
  );
};

export const useMockData = () => {
  const context = useContext(MockDataContext);
  if (!context) {
    throw new Error('useMockData must be used within a MockDataProvider');
  }
  return context;
};
