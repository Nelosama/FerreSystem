import { Rubro } from '../types';

export interface LocalizedText {
  es: string;
  en: string;
}

export interface RubroConfigLocalized {
  nombreCatalogo: LocalizedText;
  categoriasDefault: LocalizedText[];
  unidadesMedida: LocalizedText[];
  mensajeStockBajo: LocalizedText;
  activarVencimientos: boolean;
  activarGarantiaSerie: boolean;
}

export interface RubroConfig {
  nombreCatalogo: string;
  categoriasDefault: string[];
  unidadesMedida: string[];
  mensajeStockBajo: string;
  activarVencimientos: boolean;
  activarGarantiaSerie: boolean;
}

export const RUBROS_CONFIG_LOCALIZED: Record<Rubro, RubroConfigLocalized> = {
  [Rubro.FERRETERIA]: {
    nombreCatalogo: { es: 'Herramientas y Materiales', en: 'Tools and Materials' },
    categoriasDefault: [
      { es: 'Herramientas Manuales', en: 'Hand Tools' },
      { es: 'Herramientas Eléctricas', en: 'Power Tools' },
      { es: 'Tornillería', en: 'Fasteners & Hardware' },
      { es: 'Pintura', en: 'Paint' },
      { es: 'Plomería', en: 'Plumbing' },
      { es: 'Electricidad', en: 'Electrical' },
      { es: 'Construcción', en: 'Building Materials' },
    ],
    unidadesMedida: [
      { es: 'unidad', en: 'unit' },
      { es: 'caja', en: 'box' },
      { es: 'metro', en: 'meter' },
      { es: 'kg', en: 'kg' },
      { es: 'galón', en: 'gallon' },
    ],
    mensajeStockBajo: { es: 'Se está agotando {producto} en bodega', en: '{producto} is running low in warehouse' },
    activarVencimientos: false,
    activarGarantiaSerie: false,
  },
  [Rubro.PULPERIA]: {
    nombreCatalogo: { es: 'Abarrotes', en: 'Groceries' },
    categoriasDefault: [
      { es: 'Granos Básicos', en: 'Grains & Staples' },
      { es: 'Lácteos', en: 'Dairy' },
      { es: 'Bebidas', en: 'Beverages' },
      { es: 'Snacks', en: 'Snacks' },
      { es: 'Limpieza', en: 'Cleaning Supplies' },
      { es: 'Higiene', en: 'Personal Care' },
    ],
    unidadesMedida: [
      { es: 'unidad', en: 'unit' },
      { es: 'libra', en: 'lb' },
      { es: 'quintal', en: 'cwt' },
      { es: 'paquete', en: 'pack' },
    ],
    mensajeStockBajo: { es: 'Se está agotando {producto} en el mostrador', en: '{producto} is running low at the counter' },
    activarVencimientos: true,
    activarGarantiaSerie: false,
  },
  [Rubro.MINIMARKET]: {
    nombreCatalogo: { es: 'Abarrotes y Productos', en: 'Groceries and Goods' },
    categoriasDefault: [
      { es: 'Granos Básicos', en: 'Grains & Staples' },
      { es: 'Lácteos', en: 'Dairy' },
      { es: 'Bebidas', en: 'Beverages' },
      { es: 'Snacks', en: 'Snacks' },
      { es: 'Limpieza', en: 'Cleaning Supplies' },
      { es: 'Higiene', en: 'Personal Care' },
      { es: 'Congelados', en: 'Frozen Foods' },
    ],
    unidadesMedida: [
      { es: 'unidad', en: 'unit' },
      { es: 'libra', en: 'lb' },
      { es: 'quintal', en: 'cwt' },
      { es: 'paquete', en: 'pack' },
    ],
    mensajeStockBajo: { es: 'Se está agotando {producto} en el mostrador', en: '{producto} is running low at the counter' },
    activarVencimientos: true,
    activarGarantiaSerie: false,
  },
  [Rubro.FARMACIA]: {
    nombreCatalogo: { es: 'Medicamentos y Productos', en: 'Medicines and Health Products' },
    categoriasDefault: [
      { es: 'Medicamentos', en: 'Medicines' },
      { es: 'Cuidado Personal', en: 'Personal Care' },
      { es: 'Vitaminas', en: 'Vitamins' },
      { es: 'Primeros Auxilios', en: 'First Aid' },
    ],
    unidadesMedida: [
      { es: 'unidad', en: 'unit' },
      { es: 'caja', en: 'box' },
      { es: 'blister', en: 'blister' },
      { es: 'frasco', en: 'bottle' },
    ],
    mensajeStockBajo: { es: 'Bajo inventario de {producto}', en: 'Low inventory of {producto}' },
    activarVencimientos: true,
    activarGarantiaSerie: false,
  },
  [Rubro.PAPELERIA]: {
    nombreCatalogo: { es: 'Útiles y Papelería', en: 'Stationery and School Supplies' },
    categoriasDefault: [
      { es: 'Útiles Escolares', en: 'School Supplies' },
      { es: 'Oficina', en: 'Office Supplies' },
      { es: 'Arte', en: 'Art Supplies' },
      { es: 'Impresión', en: 'Printing Supplies' },
    ],
    unidadesMedida: [
      { es: 'unidad', en: 'unit' },
      { es: 'paquete', en: 'pack' },
      { es: 'resma', en: 'ream' },
      { es: 'caja', en: 'box' },
    ],
    mensajeStockBajo: { es: 'Poco stock de {producto}', en: 'Low stock of {producto}' },
    activarVencimientos: false,
    activarGarantiaSerie: false,
  },
  [Rubro.DISTRIBUIDORA]: {
    nombreCatalogo: { es: 'Catálogo Mayorista', en: 'Wholesale Catalog' },
    categoriasDefault: [],
    unidadesMedida: [
      { es: 'caja', en: 'box' },
      { es: 'paquete', en: 'pack' },
      { es: 'pallet', en: 'pallet' },
      { es: 'unidad', en: 'unit' },
    ],
    mensajeStockBajo: { es: 'Stock bajo para pedidos mayoristas de {producto}', en: 'Low stock for wholesale orders of {producto}' },
    activarVencimientos: false,
    activarGarantiaSerie: false,
  },
  [Rubro.AGROSERVICIO]: {
    nombreCatalogo: { es: 'Insumos Agropecuarios', en: 'Agricultural & Livestock Supplies' },
    categoriasDefault: [
      { es: 'Fertilizantes', en: 'Fertilizers' },
      { es: 'Semillas', en: 'Seeds' },
      { es: 'Alimento para Ganado', en: 'Lifestock Feed' },
      { es: 'Agroquímicos', en: 'Agrochenicals' },
      { es: 'Herramientas de Campo', en: 'Farm Tools' },
    ],
    unidadesMedida: [
      { es: 'quintal', en: 'cwt' },
      { es: 'saco', en: 'bag' },
      { es: 'litro', en: 'liter' },
      { es: 'unidad', en: 'unit' },
    ],
    mensajeStockBajo: { es: 'Se está agotando {producto} en bodega', en: '{producto} is running low in warehouse' },
    activarVencimientos: true,
    activarGarantiaSerie: false,
  },
  [Rubro.REPUESTOS_AUTOMOTRICES]: {
    nombreCatalogo: { es: 'Repuestos y Accesorios', en: 'Auto Parts & Accessories' },
    categoriasDefault: [
      { es: 'Motor', en: 'Engine' },
      { es: 'Frenos', en: 'Brakes' },
      { es: 'Suspensión', en: 'Suspension' },
      { es: 'Eléctrico', en: 'Electrical' },
      { es: 'Filtros', en: 'Filters' },
      { es: 'Accesorios', en: 'Accessories' },
    ],
    unidadesMedida: [
      { es: 'unidad', en: 'unit' },
      { es: 'juego', en: 'set' },
      { es: 'caja', en: 'box' },
    ],
    mensajeStockBajo: { es: 'Bajo stock de {producto}', en: 'Low stock of {producto}' },
    activarVencimientos: false,
    activarGarantiaSerie: true,
  },
  [Rubro.ELECTRODOMESTICOS]: {
    nombreCatalogo: { es: 'Electrodomésticos y Tecnología', en: 'Appliances & Technology' },
    categoriasDefault: [
      { es: 'Línea Blanca', en: 'Major Appliances' },
      { es: 'Línea Café', en: 'Small Appliances' },
      { es: 'Cómputo', en: 'Computers' },
      { es: 'Celulares', en: 'Cellphones' },
      { es: 'Accesorios', en: 'Accessories' },
    ],
    unidadesMedida: [
      { es: 'unidad', en: 'unit' },
    ],
    mensajeStockBajo: { es: 'Bajo stock de {producto}', en: 'Low stock of {producto}' },
    activarVencimientos: false,
    activarGarantiaSerie: true,
  },
  [Rubro.GENERAL]: {
    nombreCatalogo: { es: 'Inventario', en: 'Inventory' },
    categoriasDefault: [],
    unidadesMedida: [
      { es: 'unidad', en: 'unit' },
      { es: 'caja', en: 'box' },
    ],
    mensajeStockBajo: { es: 'Poco stock de {producto}', en: 'Low stock of {producto}' },
    activarVencimientos: false,
    activarGarantiaSerie: false,
  },
};

export const RUBROS_CONFIG: Record<Rubro, RubroConfig> = Object.keys(Rubro).reduce((acc, rKey) => {
  const loc = RUBROS_CONFIG_LOCALIZED[rKey as Rubro];
  acc[rKey as Rubro] = {
    nombreCatalogo: loc.nombreCatalogo.es,
    categoriasDefault: loc.categoriasDefault.map((c) => c.es),
    unidadesMedida: loc.unidadesMedida.map((u) => u.es),
    mensajeStockBajo: loc.mensajeStockBajo.es,
    activarVencimientos: loc.activarVencimientos,
    activarGarantiaSerie: loc.activarGarantiaSerie,
  };
  return acc;
}, {} as Record<Rubro, RubroConfig>);
