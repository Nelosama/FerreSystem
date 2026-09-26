import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ProductItem, QuotationItem, QuotationDetailItem } from '../types';

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

const INITIAL_COTIZACIONES: QuotationItem[] = [
  {
    id: 'cot-1',
    numero: 8,
    numeroCotizacion: 8,
    cliente: 'Constructora del Norte S. de R.L.',
    rtn: '05019001234567',
    telefono: '+504 9876-5432',
    email: 'compras@constructoranorte.hn',
    direccion: 'Zona Industrial Choloma, Cortés',
    usuarioNombre: 'Carlos Ramos (Admin Ferretería)',
    fechaEmision: new Date().toLocaleDateString('es-HN'),
    fechaValidez: '15/10/2026',
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
    numero: 7,
    numeroCotizacion: 7,
    cliente: 'Ferretería El Progreso (Subdistribuidor)',
    rtn: '05021980001234',
    telefono: '+504 2647-1122',
    usuarioNombre: 'Carlos Ramos (Cajero)',
    fechaEmision: '20/09/2026',
    fechaValidez: '10/10/2026',
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
    numero: 6,
    numeroCotizacion: 6,
    cliente: 'Ing. Roberto Flores',
    telefono: '+504 3311-2244',
    usuarioNombre: 'Carlos Ramos (Admin Ferretería)',
    fechaEmision: '22/09/2026',
    fechaValidez: '07/10/2026',
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
    numero: 5,
    numeroCotizacion: 5,
    cliente: 'Inversiones Industriales Cortés',
    rtn: '05019003322114',
    usuarioNombre: 'Carlos Ramos (Admin Ferretería)',
    fechaEmision: '18/09/2026',
    fechaValidez: '05/10/2026',
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
    numero: 4,
    numeroCotizacion: 4,
    cliente: 'Taller Mecánico San José',
    rtn: '05011985004411',
    usuarioNombre: 'Carlos Ramos (Admin Ferretería)',
    fechaEmision: '10/09/2026',
    fechaValidez: '25/09/2026',
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
  {
    id: 'v-1',
    numeroVenta: 1042,
    clienteNombre: 'Consumidor Final',
    subtotal: 37026.09,
    isv: 5553.91,
    total: 42580.00,
    metodoPago: 'EFECTIVO',
    fecha: new Date().toISOString(),
    items: [],
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

const MockDataContext = createContext<MockDataContextType | undefined>(undefined);

export const MockDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [productos, setProductos] = useState<ProductItem[]>(() => {
    const saved = localStorage.getItem('ferre_mock_productos');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTOS;
  });

  const [cotizaciones, setCotizaciones] = useState<QuotationItem[]>(() => {
    const saved = localStorage.getItem('ferre_mock_cotizaciones');
    return saved ? JSON.parse(saved) : INITIAL_COTIZACIONES;
  });

  const [ventas, setVentas] = useState<SaleRecord[]>(() => {
    const saved = localStorage.getItem('ferre_mock_ventas');
    return saved ? JSON.parse(saved) : INITIAL_VENTAS;
  });

  const [usuarios, setUsuarios] = useState<Usuario[]>(() => {
    const saved = localStorage.getItem('ferre_users');
    return saved ? JSON.parse(saved) : INITIAL_USUARIOS;
  });

  useEffect(() => {
    localStorage.setItem('ferre_mock_productos', JSON.stringify(productos));
  }, [productos]);

  useEffect(() => {
    localStorage.setItem('ferre_mock_cotizaciones', JSON.stringify(cotizaciones));
  }, [cotizaciones]);

  useEffect(() => {
    localStorage.setItem('ferre_mock_ventas', JSON.stringify(ventas));
  }, [ventas]);

  useEffect(() => {
    localStorage.setItem('ferre_users', JSON.stringify(usuarios));
  }, [usuarios]);

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
