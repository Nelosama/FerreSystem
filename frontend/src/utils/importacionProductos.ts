import { normalizarUnidadMedida, unidadCsvValida } from './unidadMedida';

/**
 * Lógica pura de la importación masiva de inventario (`POST /productos/importacion`).
 *
 * Espeja las reglas de `backend/src/productos/importacion-productos.ts` para avisar antes de enviar.
 * La validación del servidor es la que manda: sus errores se muestran junto a la fila afectada.
 *
 * Reglas que importan al usuario:
 * - Celda de precio vacía = «no informado»: nunca se envía como 0 y nunca deja un precio en L.0.00 por accidente.
 * - Un precio de venta igual a 0 se rechaza; un costo de 0 explícito es legítimo.
 * - Solo ADMIN envía precios o aprueba precios; sin aprobación el precio queda PENDIENTE_APROBACION.
 * - Los errores bloquean todo el archivo (todo o nada).
 */

export const MAX_FILAS_IMPORTACION = 5000;
export const MOTIVO_IMPORTACION = 'Importación de inventario revisada';

export const CAMPOS_IMPORTACION = [
  'codigo', 'nombre', 'codigoBarras', 'categoria', 'unidadMedida',
  'stockActual', 'stockMinimo', 'precioCosto', 'precioVenta',
] as const;
export type CampoImportacion = (typeof CAMPOS_IMPORTACION)[number];

/** Encabezados aceptados por campo, ya normalizados (minúsculas, sin signos ni espacios). */
const ALIAS_CAMPO: Record<CampoImportacion, string[]> = {
  codigo: ['codigo', 'code', 'sku', 'codigoproducto', 'cod'],
  nombre: ['nombre', 'name', 'producto', 'articulo', 'descripcion'],
  codigoBarras: ['codigobarras', 'codigodebarras', 'barcode', 'barras', 'ean'],
  categoria: ['categoria', 'category', 'cat'],
  unidadMedida: ['unidadmedida', 'unidad', 'medida', 'unit'],
  stockActual: ['stockactual', 'stock', 'existencias', 'cantidad', 'qty', 'quantity'],
  stockMinimo: ['stockminimo', 'minimo', 'minstock'],
  precioCosto: ['preciocosto', 'costo', 'costounitario', 'cost'],
  precioVenta: ['precioventa', 'precio', 'pvp', 'price'],
};

export const CAMPOS_PRECIO: readonly CampoImportacion[] = ['precioCosto', 'precioVenta'];

export type EstadoPrecio = 'APROBADO' | 'PENDIENTE_APROBACION' | 'SIN_PRECIO';

export interface ProductoExistente {
  id: string;
  codigo: string;
  nombre: string;
  codigoBarras?: string | null;
  precioVenta?: number | string | null;
  precioAprobado?: boolean;
  estadoPrecio?: EstadoPrecio;
}

export interface ErrorImportacion {
  fila: number;
  campo: string;
  mensaje: string;
}

export type AccionPrevia = 'NUEVO' | 'OMITIR' | 'ACTUALIZAR' | 'ERROR';

export interface FilaPrevia {
  fila: number;
  codigo: string;
  nombre: string;
  /** Texto leído de cada columna, para mostrarlo tal cual en la vista previa. */
  valores: Partial<Record<CampoImportacion, string>>;
  /** Cuerpo de la fila tal como se envía. Los campos vacíos o no permitidos no aparecen. */
  envio: Record<string, string>;
  errores: ErrorImportacion[];
  advertencias: string[];
  existente: ProductoExistente | null;
  accion: AccionPrevia;
  /** Estado del precio que quedaría (previsto). null si el usuario no ve precios. */
  estadoPrecioPrevisto: EstadoPrecio | null;
}

export interface OpcionesPrevia {
  existentes: ProductoExistente[];
  sobrescribir: boolean;
  aprobarPrecios: boolean;
  /** true solo para ADMIN. */
  puedePrecios: boolean;
}

export interface PreviaImportacion {
  filas: FilaPrevia[];
  /** Avisos que afectan al archivo completo (p. ej. precios ignorados por el rol). */
  avisos: string[];
  resumen: {
    total: number;
    nuevos: number;
    actualizar: number;
    omitir: number;
    conError: number;
    precioAprobado: number;
    precioPendiente: number;
    sinPrecio: number;
  };
}

/** Clave comparable de nombre: sin acentos, sin mayúsculas, espacios colapsados. Igual que el backend. */
export const claveNombre = (valor: string): string =>
  valor.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const normalizarEncabezado = (valor: string): string =>
  valor.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Lee la columna que corresponda a un campo, sin importar mayúsculas, acentos ni separadores. */
export function leerCampo(fila: Record<string, unknown>, campo: CampoImportacion): string {
  const alias = ALIAS_CAMPO[campo];
  for (const columna of Object.keys(fila)) {
    if (alias.includes(normalizarEncabezado(columna))) {
      const valor = fila[columna];
      return valor === undefined || valor === null ? '' : String(valor).trim();
    }
  }
  return '';
}

/**
 * Lee un importe en formato de la API (punto decimal). Acepta coma decimal (1 o 2 decimales), que es lo que
 * produce Excel en español. Devuelve el texto listo para enviar o un error.
 */
export function importeParaEnvio(texto: string): { valor: string | null; error?: string } {
  if (texto === '') return { valor: null };
  const normalizado = /^-?\d+,\d{1,2}$/.test(texto) ? texto.replace(',', '.') : texto;
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return { valor: null, error: 'no es un número válido' };
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return { valor: null, error: 'no es un número válido' };
  if (Math.abs(numero * 100 - Math.round(numero * 100)) > 1e-6) return { valor: null, error: 'admite como máximo dos decimales' };
  return { valor: (Math.round(numero * 100) / 100).toFixed(2) };
}

const ETIQUETA_CAMPO: Record<CampoImportacion, string> = {
  codigo: 'Código',
  nombre: 'Nombre',
  codigoBarras: 'Código de barras',
  categoria: 'Categoría',
  unidadMedida: 'Unidad de medida',
  stockActual: 'Existencias',
  stockMinimo: 'Stock mínimo',
  precioCosto: 'Precio de costo',
  precioVenta: 'Precio de venta',
};
export const etiquetaCampoImportacion = (campo: string): string =>
  (ETIQUETA_CAMPO as Record<string, string>)[campo] ?? campo;

const LIMITE_TEXTO: Partial<Record<CampoImportacion, number>> = { codigo: 100, nombre: 200, codigoBarras: 100, categoria: 100 };

const estadoPrecioDe = (aprobado: boolean, venta: number | null): EstadoPrecio =>
  aprobado ? 'APROBADO' : venta !== null && venta > 0 ? 'PENDIENTE_APROBACION' : 'SIN_PRECIO';

/**
 * Valida cada fila contra las reglas de la importación y la compara con los productos existentes.
 * No envía nada: solo prepara la vista previa y decide qué filas bloquean la importación.
 */
export function prepararPrevia(crudas: Record<string, unknown>[], opciones: OpcionesPrevia): PreviaImportacion {
  const avisos: string[] = [];
  const porCodigo = new Map(opciones.existentes.map((p) => [p.codigo.trim().toUpperCase(), p]));
  const porBarras = new Map(opciones.existentes.filter((p) => p.codigoBarras).map((p) => [p.codigoBarras as string, p]));
  const porNombreExistente = new Map<string, ProductoExistente[]>();
  for (const p of opciones.existentes) {
    const clave = claveNombre(p.nombre);
    porNombreExistente.set(clave, [...(porNombreExistente.get(clave) ?? []), p]);
  }
  const filas: FilaPrevia[] = [];

  if (!opciones.puedePrecios) {
    const hayPrecios = crudas.some((f) => CAMPOS_PRECIO.some((c) => leerCampo(f, c) !== ''));
    if (hayPrecios) avisos.push('Las columnas de precio se ignoran: solo el administrador puede importar precios. Los precios actuales no se modifican.');
  }

  crudas.forEach((cruda, indice) => {
    const fila = indice + 1;
    const errores: ErrorImportacion[] = [];
    const advertencias: string[] = [];
    const valores: Partial<Record<CampoImportacion, string>> = {};
    const envio: Record<string, string> = {};
    const error = (campo: string, mensaje: string) => errores.push({ fila, campo, mensaje });

    for (const campo of CAMPOS_IMPORTACION) valores[campo] = leerCampo(cruda, campo);

    const codigo = valores.codigo ?? '';
    const nombre = valores.nombre ?? '';
    if (!codigo) error('codigo', 'El código es obligatorio');
    if (!nombre) error('nombre', 'El nombre es obligatorio');
    for (const campo of ['codigo', 'nombre', 'codigoBarras', 'categoria'] as const) {
      const limite = LIMITE_TEXTO[campo];
      if (limite && (valores[campo] ?? '').length > limite) error(campo, `Supera ${limite} caracteres`);
    }

    if (codigo) envio.codigo = codigo.toUpperCase();
    if (nombre) envio.nombre = nombre.replace(/\s+/g, ' ');
    if (valores.codigoBarras) envio.codigoBarras = valores.codigoBarras;
    if (valores.categoria) envio.categoria = valores.categoria.replace(/\s+/g, ' ');

    const unidad = valores.unidadMedida ?? '';
    if (unidad) {
      if (unidadCsvValida(unidad)) envio.unidadMedida = normalizarUnidadMedida(unidad);
      else error('unidadMedida', `Unidad no válida: «${unidad}». Use una de las unidades del inventario.`);
    }

    for (const [campo, minimo] of [['stockActual', 'Las existencias'], ['stockMinimo', 'El stock mínimo']] as const) {
      const r = importeParaEnvio(valores[campo] ?? '');
      if (r.error) error(campo, `${minimo} ${r.error}`);
      else if (r.valor !== null && Number(r.valor) < 0) error(campo, `${minimo} no puede ser negativo`);
      else if (r.valor !== null) envio[campo] = r.valor;
    }

    // Precios: solo se envían si el rol puede importarlos. Vacío = no informado (no se envía, no es 0).
    const costoTexto = valores.precioCosto ?? '';
    const ventaTexto = valores.precioVenta ?? '';
    if (opciones.puedePrecios) {
      const costo = importeParaEnvio(costoTexto);
      if (costo.error) error('precioCosto', `El precio de costo ${costo.error}`);
      else if (costo.valor !== null && Number(costo.valor) < 0) error('precioCosto', 'El precio de costo no puede ser negativo');
      else if (costo.valor !== null) envio.precioCosto = costo.valor;

      const venta = importeParaEnvio(ventaTexto);
      if (venta.error) error('precioVenta', `El precio de venta ${venta.error}`);
      else if (venta.valor !== null && Number(venta.valor) < 0) error('precioVenta', 'El precio de venta no puede ser negativo');
      else if (venta.valor !== null && Number(venta.valor) === 0) error('precioVenta', 'Un precio de venta de 0 no es vendible. Deje la celda vacía si aún no tiene precio.');
      else if (venta.valor !== null) envio.precioVenta = venta.valor;
    }

    const existente = codigo ? porCodigo.get(codigo.toUpperCase()) ?? null : null;
    const barras = valores.codigoBarras ?? '';
    if (barras) {
      const otro = porBarras.get(barras);
      if (otro && otro.codigo.trim().toUpperCase() !== codigo.toUpperCase()) {
        error('codigoBarras', `Código de barras ya registrado en el producto ${otro.codigo}`);
      }
    }

    // Nombre parecido con otro código: no bloquea, puede ser un producto legítimo distinto.
    const parecidos = nombre
      ? (porNombreExistente.get(claveNombre(nombre)) ?? []).filter((p) => p.codigo.trim().toUpperCase() !== codigo.toUpperCase())
      : [];
    if (parecidos.length) {
      advertencias.push(`Nombre parecido a «${parecidos[0].nombre}» (código ${parecidos[0].codigo}) que ya existe en el inventario. Revise que no sea el mismo artículo.`);
    }

    let accion: AccionPrevia;
    let estadoPrecioPrevisto: EstadoPrecio | null = null;
    if (errores.length) accion = 'ERROR';
    else if (existente && !opciones.sobrescribir) accion = 'OMITIR';
    else if (existente) accion = 'ACTUALIZAR';
    else accion = 'NUEVO';

    if (opciones.puedePrecios && accion !== 'ERROR') {
      const ventaNueva = envio.precioVenta !== undefined ? Number(envio.precioVenta) : null;
      if (accion === 'NUEVO' || accion === 'ACTUALIZAR') {
        const ventaFinal = ventaNueva ?? (accion === 'ACTUALIZAR' && existente ? Number(existente.precioVenta ?? 0) : null);
        const ventaCambia = accion === 'ACTUALIZAR' && ventaNueva !== null && ventaNueva !== Number(existente?.precioVenta ?? 0);
        const yaAprobado = accion === 'ACTUALIZAR' && !!existente?.precioAprobado;
        const aprobadoFinal = (opciones.aprobarPrecios && ventaNueva !== null && (ventaCambia || !yaAprobado)) || (yaAprobado && !ventaCambia);
        estadoPrecioPrevisto = estadoPrecioDe(!!aprobadoFinal && (ventaFinal ?? 0) > 0, ventaFinal);
      } else {
        estadoPrecioPrevisto = existente?.estadoPrecio ?? null;
      }
    }

    filas.push({
      fila,
      codigo,
      nombre,
      valores,
      envio,
      errores,
      advertencias,
      existente,
      accion,
      estadoPrecioPrevisto,
    });
  });

  // Duplicados dentro del archivo: se bloquean todas las filas del grupo para no decidir cuál gana.
  const bloquearGrupos = (campo: 'codigo' | 'codigoBarras', clave: (f: FilaPrevia) => string) => {
    const grupos = new Map<string, FilaPrevia[]>();
    for (const f of filas) {
      const k = clave(f);
      if (!k) continue;
      grupos.set(k, [...(grupos.get(k) ?? []), f]);
    }
    for (const grupo of grupos.values()) {
      if (grupo.length < 2) continue;
      const lista = grupo.map((f) => f.fila).join(', ');
      for (const f of grupo) {
        f.errores.push({ fila: f.fila, campo, mensaje: `${campo === 'codigo' ? 'Código' : 'Código de barras'} repetido en el archivo (filas ${lista})` });
        f.accion = 'ERROR';
        f.estadoPrecioPrevisto = null;
      }
    }
  };
  bloquearGrupos('codigo', (f) => f.codigo.toUpperCase());
  bloquearGrupos('codigoBarras', (f) => f.valores.codigoBarras ?? '');

  // Nombres repetidos con códigos distintos dentro del archivo: solo aviso.
  const porNombre = new Map<string, FilaPrevia[]>();
  for (const f of filas) if (f.nombre) porNombre.set(claveNombre(f.nombre), [...(porNombre.get(claveNombre(f.nombre)) ?? []), f]);
  for (const grupo of porNombre.values()) {
    if (grupo.length < 2 || new Set(grupo.map((f) => f.codigo.toUpperCase())).size < 2) continue;
    const lista = grupo.map((f) => f.fila).join(', ');
    for (const f of grupo) f.advertencias.push(`El mismo nombre aparece en otras filas con código distinto (filas ${lista}).`);
  }

  const resumen = {
    total: filas.length,
    nuevos: filas.filter((f) => f.accion === 'NUEVO').length,
    actualizar: filas.filter((f) => f.accion === 'ACTUALIZAR').length,
    omitir: filas.filter((f) => f.accion === 'OMITIR').length,
    conError: filas.filter((f) => f.accion === 'ERROR').length,
    precioAprobado: filas.filter((f) => f.estadoPrecioPrevisto === 'APROBADO').length,
    precioPendiente: filas.filter((f) => f.estadoPrecioPrevisto === 'PENDIENTE_APROBACION').length,
    sinPrecio: filas.filter((f) => f.estadoPrecioPrevisto === 'SIN_PRECIO').length,
  };
  return { filas, avisos, resumen };
}

/** Cuerpo de `POST /productos/importacion`: archivo completo con el mismo solicitudId en cada reintento. */
export function construirSolicitud(
  filas: FilaPrevia[],
  opciones: { sobrescribir: boolean; aprobarPrecios: boolean; puedePrecios: boolean },
  solicitudId: string,
) {
  return {
    solicitudId,
    filas: filas.map((f) => f.envio),
    sobrescribir: opciones.sobrescribir,
    ...(opciones.puedePrecios ? { aprobarPrecios: opciones.aprobarPrecios } : {}),
    motivo: MOTIVO_IMPORTACION,
  };
}

/** Huella del contenido enviado: si cambia el archivo o una opción, el solicitudId debe cambiar. */
export const huellaSolicitud = (cuerpo: ReturnType<typeof construirSolicitud>): string => {
  const { solicitudId: _id, ...resto } = cuerpo;
  return JSON.stringify(resto);
};

/** UUID v4 con crypto.getRandomValues (disponible también fuera de contextos seguros). */
export function nuevoSolicitudId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface RespuestaImportacion {
  resultado: string;
  creados: number;
  actualizados: number;
  sinCambios: number;
  omitidos: number;
  reintento: boolean;
  filas: { fila: number; codigo: string; accion: 'CREADO' | 'ACTUALIZADO' | 'SIN_CAMBIOS' | 'OMITIDO'; estadoPrecio?: EstadoPrecio }[];
  advertencias: { fila: number; codigo: string | null; tipo: string; mensaje: string }[];
}

export type ErrorImportacionUsuario =
  | { tipo: 'VALIDACION'; mensaje: string; errores: ErrorImportacion[] }
  | { tipo: 'PERMISO'; mensaje: string }
  /** `nuevaSolicitud`: el próximo envío debe usar un solicitudId nuevo. `recargar`: volver a leer el inventario. */
  | { tipo: 'CONFLICTO'; mensaje: string; nuevaSolicitud: boolean; recargar: boolean }
  /** Sin respuesta o error del servidor: se conserva el solicitudId para reintentar sin duplicar. */
  | { tipo: 'RED'; mensaje: string };

/** Traduce un error de Axios de la importación a un mensaje y una acción para el usuario. */
export function interpretarErrorImportacion(err: unknown): ErrorImportacionUsuario {
  const respuesta = (err as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
  if (!respuesta) return { tipo: 'RED', mensaje: 'No hubo respuesta del servidor. Revise la conexión y vuelva a confirmar: el archivo no se duplicará.' };
  const status = respuesta.status ?? 0;
  const data = respuesta.data ?? {};
  const mensajeServidor = typeof data.message === 'string' ? data.message : '';

  if (status === 400) {
    const errores = Array.isArray(data.errores) ? (data.errores as ErrorImportacion[]) : [];
    return {
      tipo: 'VALIDACION',
      mensaje: errores.length ? 'El servidor encontró errores. No se guardó ninguna fila; corrija las filas marcadas.' : (mensajeServidor || 'El archivo no es válido.'),
      errores,
    };
  }
  if (status === 403) {
    return { tipo: 'PERMISO', mensaje: mensajeServidor || 'Su usuario no puede importar precios. Solo el administrador puede hacerlo.' };
  }
  if (status === 409) {
    if (data.code === 'PRODUCTO_VERSION') {
      return { tipo: 'CONFLICTO', mensaje: 'Un producto cambió durante la importación. No se guardó nada: vuelva a cargar el archivo.', nuevaSolicitud: true, recargar: true };
    }
    return { tipo: 'CONFLICTO', mensaje: mensajeServidor || 'Esta importación ya se registró con otros datos. Revise el archivo y confirme de nuevo.', nuevaSolicitud: true, recargar: false };
  }
  return { tipo: 'RED', mensaje: 'El servidor no pudo completar la importación. Vuelva a confirmar: el archivo no se duplicará.' };
}
