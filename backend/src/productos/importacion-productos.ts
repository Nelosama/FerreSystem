import { UnidadMedida } from '../types/prisma-enums';

/**
 * Validación pura de la importación masiva de productos (sin base de datos).
 *
 * Reglas de negocio (ver docs/CONTEXTO_MAESTRO.md, sección de auditoría 12/10):
 * - Precio ausente (celda vacía) ≠ precio cero ≠ precio pendiente de aprobación.
 *   · precioVenta: vacío = sin precio (el producto no se puede vender); 0 explícito se rechaza
 *     (un precio de venta cero nunca es vendible); mayor que cero = precio propuesto.
 *   · precioCosto: vacío = no informado; 0 explícito = costo cero legítimo (se acepta y se marca).
 * - Un precio solo queda aprobado si el ADMIN envía `aprobarPrecios`; ver `ProductosService.importar`.
 * - Los errores se reportan por fila y bloquean la importación completa (todo o nada).
 */

export const MAX_FILAS_IMPORTACION = 5000;
const MAX_IMPORTE = 9999999999.99;
const MAX_CODIGO = 100;
const MAX_NOMBRE = 200;
const MAX_CATEGORIA = 100;

/** Alias de unidad aceptados además del valor exacto del enum (mismos que la plantilla del frontend). */
const ALIAS_UNIDAD: Record<string, UnidadMedida> = {
  UNIT: UnidadMedida.UNIDAD, BOX: UnidadMedida.CAJA, METER: UnidadMedida.METRO, GALLON: UnidadMedida.GALON,
  LITER: UnidadMedida.LITRO, PACK: UnidadMedida.PAQUETE, POUND: UnidadMedida.LIBRA, FOOT: UnidadMedida.PIE,
  LB: UnidadMedida.LIBRA,
};

export interface ErrorFilaImportacion { fila: number; codigo: string | null; campo: string; mensaje: string }

/** Avisos no bloqueantes: un nombre parecido puede ser un producto legítimo, así que se informa y no se rechaza. */
export interface AdvertenciaFilaImportacion {
  fila: number;
  codigo: string | null;
  tipo: 'NOMBRE_REPETIDO_EN_ARCHIVO' | 'NOMBRE_REPETIDO_EN_BASE';
  mensaje: string;
  /** Filas del archivo con el mismo nombre (solo NOMBRE_REPETIDO_EN_ARCHIVO). */
  filas?: number[];
  /** Productos existentes con el mismo nombre (solo NOMBRE_REPETIDO_EN_BASE). */
  coincidencias?: { productoId: string; codigo: string; nombre: string; activo: boolean }[];
}

export interface FilaImportacion {
  fila: number;
  codigo: string;
  codigoClave: string;
  nombre: string;
  nombreClave: string;
  codigoBarras: string | null;
  categoria: string | null;
  unidadMedida: UnidadMedida | null;
  stockActual: number | null;
  stockMinimo: number | null;
  precioCosto: number | null;
  precioVenta: number | null;
}

/** Clave comparable: sin acentos, sin mayúsculas y con espacios colapsados. */
export function claveTexto(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Texto para guardar: forma NFC, espacios colapsados y sin bordes. */
export function textoLimpio(valor: string): string {
  return valor.normalize('NFC').replace(/\s+/g, ' ').trim();
}

const vacio = (valor: unknown) => valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');

/** Lee un importe. Vacío → null (ausente). Rechaza texto, separadores de miles y más de dos decimales. */
export function leerImporte(valor: unknown): { valor: number | null; error?: string } {
  if (vacio(valor)) return { valor: null };
  let numero: number;
  if (typeof valor === 'number') numero = valor;
  else if (typeof valor === 'string' && /^-?\d+(\.\d+)?$/.test(valor.trim())) numero = Number(valor.trim());
  else return { valor: null, error: 'no es un número válido (use punto decimal y sin separador de miles)' };
  if (!Number.isFinite(numero)) return { valor: null, error: 'no es un número válido' };
  if (Math.abs(numero * 100 - Math.round(numero * 100)) > 1e-6) return { valor: null, error: 'admite como máximo dos decimales' };
  if (Math.abs(numero) > MAX_IMPORTE) return { valor: null, error: 'está fuera del rango permitido' };
  return { valor: Math.round(numero * 100) / 100 };
}

/** Texto opcional: acepta cadenas y números (un CSV puede traer el código como número). */
function leerTexto(valor: unknown, maximo: number): { valor: string | null; error?: string } {
  if (vacio(valor)) return { valor: null };
  if (typeof valor !== 'string' && typeof valor !== 'number') return { valor: null, error: 'tipo de dato no válido' };
  const limpio = textoLimpio(String(valor));
  if (limpio.length > maximo) return { valor: null, error: `supera ${maximo} caracteres` };
  return { valor: limpio };
}

export function leerUnidad(valor: unknown): { valor: UnidadMedida | null; error?: string } {
  const texto = leerTexto(valor, 40);
  if (texto.error) return { valor: null, error: texto.error };
  if (texto.valor === null) return { valor: null };
  const clave = texto.valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, '_');
  const unidad = (Object.values(UnidadMedida) as string[]).includes(clave) ? (clave as UnidadMedida) : ALIAS_UNIDAD[clave];
  return unidad ? { valor: unidad } : { valor: null, error: `unidad no válida: "${texto.valor}"` };
}

/** Indica si la fila trae algún precio (venta o costo) con valor. Un precio vacío no cuenta. */
export function filaTienePrecio(fila: unknown): boolean {
  if (!fila || typeof fila !== 'object') return false;
  const r = fila as Record<string, unknown>;
  return !vacio(r.precioVenta) || !vacio(r.precioCosto);
}

/**
 * Valida todas las filas y los duplicados dentro del archivo. Los duplicados contra la base de datos se
 * comprueban en el servicio, dentro de la misma transacción.
 */
export function validarFilasImportacion(filas: unknown[]): {
  validas: FilaImportacion[];
  errores: ErrorFilaImportacion[];
  advertencias: AdvertenciaFilaImportacion[];
} {
  const errores: ErrorFilaImportacion[] = [];
  const validas: FilaImportacion[] = [];

  filas.forEach((crudo, indice) => {
    const fila = indice + 1;
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) {
      errores.push({ fila, codigo: null, campo: '*', mensaje: 'fila malformada: se esperaba un objeto con los campos del producto' });
      return;
    }
    const r = crudo as Record<string, unknown>;
    const errorFila: ErrorFilaImportacion[] = [];
    const error = (campo: string, mensaje: string) => errorFila.push({ fila, codigo: null, campo, mensaje });

    const codigo = leerTexto(r.codigo, MAX_CODIGO);
    if (codigo.error) error('codigo', codigo.error);
    if (!codigo.valor && !codigo.error) error('codigo', 'el código del producto es requerido');
    const nombre = leerTexto(r.nombre, MAX_NOMBRE);
    if (nombre.error) error('nombre', nombre.error);
    if (!nombre.valor && !nombre.error) error('nombre', 'el nombre del producto es requerido');
    const barras = leerTexto(r.codigoBarras, 100);
    if (barras.error) error('codigoBarras', barras.error);
    const categoria = leerTexto(r.categoria, MAX_CATEGORIA);
    if (categoria.error) error('categoria', categoria.error);
    const unidad = leerUnidad(r.unidadMedida);
    if (unidad.error) error('unidadMedida', unidad.error);

    const stock = leerImporte(r.stockActual);
    if (stock.error) error('stockActual', stock.error);
    else if (stock.valor !== null && stock.valor < 0) error('stockActual', 'no puede ser negativo');
    const minimo = leerImporte(r.stockMinimo);
    if (minimo.error) error('stockMinimo', minimo.error);
    else if (minimo.valor !== null && minimo.valor < 0) error('stockMinimo', 'no puede ser negativo');

    // Costo: cero explícito es legítimo. Venta: cero o negativo no es un precio vendible.
    const costo = leerImporte(r.precioCosto);
    if (costo.error) error('precioCosto', costo.error);
    else if (costo.valor !== null && costo.valor < 0) error('precioCosto', 'no puede ser negativo');
    const venta = leerImporte(r.precioVenta);
    if (venta.error) error('precioVenta', venta.error);
    else if (venta.valor !== null && venta.valor < 0) error('precioVenta', 'no puede ser negativo');
    else if (venta.valor === 0) error('precioVenta', 'un precio de venta cero no es vendible: deje la celda vacía si aún no tiene precio');

    if (errorFila.length) {
      const codigoFila = codigo.valor ? codigo.valor.toUpperCase() : null;
      errores.push(...errorFila.map((e) => ({ ...e, codigo: codigoFila })));
      return;
    }
    const codigoValor = codigo.valor!.toUpperCase();
    validas.push({
      fila,
      codigo: codigoValor,
      codigoClave: codigoValor,
      nombre: nombre.valor!,
      nombreClave: claveTexto(nombre.valor!),
      codigoBarras: barras.valor,
      categoria: categoria.valor,
      unidadMedida: unidad.valor,
      stockActual: stock.valor,
      stockMinimo: minimo.valor,
      precioCosto: costo.valor,
      precioVenta: venta.valor,
    });
  });

  // Duplicados dentro del archivo: se bloquean todas las filas implicadas para no decidir cuál gana.
  const duplicadosEn = (campo: 'codigo' | 'codigoBarras', clave: (f: FilaImportacion) => string | null) => {
    const grupos = new Map<string, FilaImportacion[]>();
    for (const f of validas) {
      const k = clave(f);
      if (!k) continue;
      grupos.set(k, [...(grupos.get(k) ?? []), f]);
    }
    for (const grupo of grupos.values()) {
      if (grupo.length < 2) continue;
      const filasTexto = grupo.map((f) => f.fila).join(', ');
      for (const f of grupo) {
        errores.push({
          fila: f.fila,
          codigo: f.codigo,
          campo,
          mensaje: campo === 'codigo'
            ? `código repetido en el archivo (filas ${filasTexto})`
            : `código de barras repetido en el archivo (filas ${filasTexto})`,
        });
      }
    }
  };
  duplicadosEn('codigo', (f) => f.codigoClave);
  duplicadosEn('codigoBarras', (f) => f.codigoBarras);

  // Nombres parecidos con código distinto: no se bloquea (puede ser un producto legítimo), solo se avisa.
  const advertencias: AdvertenciaFilaImportacion[] = [];
  const porNombre = new Map<string, FilaImportacion[]>();
  for (const f of validas) porNombre.set(f.nombreClave, [...(porNombre.get(f.nombreClave) ?? []), f]);
  for (const grupo of porNombre.values()) {
    const codigosDistintos = new Set(grupo.map((f) => f.codigoClave));
    if (grupo.length < 2 || codigosDistintos.size < 2) continue;
    const filasTexto = grupo.map((f) => f.fila);
    for (const f of grupo) {
      advertencias.push({
        fila: f.fila,
        codigo: f.codigo,
        tipo: 'NOMBRE_REPETIDO_EN_ARCHIVO',
        mensaje: `el nombre «${f.nombre}» aparece en otras filas del archivo con código distinto (filas ${filasTexto.join(', ')})`,
        filas: filasTexto,
      });
    }
  }

  errores.sort((a, b) => a.fila - b.fila);
  return { validas, errores, advertencias };
}
