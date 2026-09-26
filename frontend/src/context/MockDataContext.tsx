import React, { createContext, useContext, useState, useEffect } from 'react';

export interface ProductItem {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  precioVenta: number;
  precioCosto: number;
  stockActual: number;
  stockMinimo: number;
  unidadMedida: string;
}

export interface QuotationItem {
  id: string;
  numero: number;
  cliente: string;
  rtn?: string;
  fechaValidez: string;
  subtotal: number;
  isv: number;
  total: number;
  estado: 'BORRADOR' | 'ENVIADA' | 'APROBADA' | 'RECHAZADA' | 'CONVERTIDA';
  itemsCount: number;
}

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
  fecha: string; // ISO or YYYY-MM-DD
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
  convertirCotizacionAVenta: (cotizacionId: string) => void;
  registrarVenta: (venta: Omit<SaleRecord, 'id' | 'numeroVenta' | 'fecha'>) => SaleRecord;
  agregarUsuario: (usuario: Omit<Usuario, 'id'>) => Usuario;
  actualizarUsuario: (id: string, data: Partial<Omit<Usuario, 'id'>>) => void;
}

const INITIAL_PRODUCTOS: ProductItem[] = [
  {
    id: 'p-1',
    codigo: 'HER-001',
    nombre: 'Martillo de Uña Curva 16oz Stanley',
    categoria: 'Herramientas',
    precioVenta: 245.00,
    precioCosto: 160.00,
    stockActual: 24,
    stockMinimo: 8,
    unidadMedida: 'UNIDAD',
  },
  {
    id: 'p-2',
    codigo: 'CON-001',
    nombre: 'Cemento Bijao Gris Uso General 42.5kg',
    categoria: 'Construcción',
    precioVenta: 220.00,
    precioCosto: 185.00,
    stockActual: 180,
    stockMinimo: 50,
    unidadMedida: 'UNIDAD',
  },
  {
    id: 'p-3',
    codigo: 'CON-002',
    nombre: 'Varilla Corrugada 3/8" Grado 40 (6m)',
    categoria: 'Construcción',
    precioVenta: 165.00,
    precioCosto: 130.00,
    stockActual: 5,
    stockMinimo: 40,
    unidadMedida: 'UNIDAD',
  },
  {
    id: 'p-4',
    codigo: 'PLO-001',
    nombre: 'Tubo PVC Sanitario 4" x 6m Durman',
    categoria: 'Plomería',
    precioVenta: 380.00,
    precioCosto: 275.00,
    stockActual: 3,
    stockMinimo: 15,
    unidadMedida: 'UNIDAD',
  },
  {
    id: 'p-5',
    codigo: 'ELE-001',
    nombre: 'Cable THHN Calibre 12 AWG Rollo 100m',
    categoria: 'Electricidad',
    precioVenta: 1450.00,
    precioCosto: 1100.00,
    stockActual: 2,
    stockMinimo: 10,
    unidadMedida: 'UNIDAD',
  },
  {
    id: 'p-6',
    codigo: 'HER-002',
    nombre: 'Cinta Métrica 8m / 26ft Truper Grip',
    categoria: 'Herramientas',
    precioVenta: 185.00,
    precioCosto: 115.00,
    stockActual: 15,
    stockMinimo: 6,
    unidadMedida: 'UNIDAD',
  },
];

const INITIAL_COTIZACIONES: QuotationItem[] = [
  {
    id: 'cot-1',
    numero: 8,
    cliente: 'Constructora del Norte S. de R.L.',
    rtn: '05019001234567',
    fechaValidez: '25/09/2026',
    subtotal: 18500.00,
    isv: 2775.00,
    total: 21275.00,
    estado: 'APROBADA',
    itemsCount: 4,
  },
  {
    id: 'cot-2',
    numero: 7,
    cliente: 'Ferretería El Progreso (Subdistribuidor)',
    rtn: '05021980001234',
    fechaValidez: '25/09/2026',
    subtotal: 8400.00,
    isv: 1260.00,
    total: 9660.00,
    estado: 'ENVIADA',
    itemsCount: 2,
  },
  {
    id: 'cot-3',
    numero: 6,
    cliente: 'Ing. Roberto Flores',
    fechaValidez: '25/09/2026',
    subtotal: 3200.00,
    isv: 480.00,
    total: 3680.00,
    estado: 'BORRADOR',
    itemsCount: 3,
  },
  {
    id: 'cot-4',
    numero: 5,
    cliente: 'Inversiones Industriales Cortés',
    fechaValidez: '28/09/2026',
    subtotal: 45000.00,
    isv: 6750.00,
    total: 51750.00,
    estado: 'ENVIADA',
    itemsCount: 8,
  },
  {
    id: 'cot-5',
    numero: 4,
    cliente: 'Taller Mecánico San José',
    fechaValidez: '18/09/2026',
    subtotal: 6200.00,
    isv: 930.00,
    total: 7130.00,
    estado: 'CONVERTIDA',
    itemsCount: 5,
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
    const nueva: QuotationItem = {
      ...cotizacionData,
      id: `cot-${Date.now()}`,
      numero: maxNumero + 1,
    };
    setCotizaciones((prev) => [nueva, ...prev]);
    return nueva;
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

    // Registrar venta asociada
    registrarVenta({
      clienteNombre: cot.cliente,
      clienteRtn: cot.rtn,
      subtotal: cot.subtotal,
      isv: cot.isv,
      total: cot.total,
      metodoPago: 'EFECTIVO',
      items: [],
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
