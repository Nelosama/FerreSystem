/**
 * Lógica pura de la edición de productos (FS-07).
 * Solo se envían los campos que realmente cambiaron: una edición parcial nunca
 * reescribe datos que el usuario no tocó, en particular existencias y precios.
 */

export type FormularioProducto = Record<string, string | boolean>;

/** Campos que cambian precios, identidad del producto, estado o existencias: requieren confirmación. */
export const CAMPOS_SENSIBLES = ['codigo', 'codigoBarras', 'unidadMedida', 'precioVenta', 'precioCosto', 'stockActual', 'activo'] as const;

const texto = (valor: unknown) => (valor == null ? '' : String(valor));

/** Nombre real de la categoría: nunca el texto de visualización de respaldo. */
export const nombreCategoria = (producto: any): string => texto(producto.categoriaNombre ?? producto.categoria?.nombre);

/** Convierte un producto del API en valores editables del formulario. */
export function formularioDesde(producto: any): FormularioProducto {
  return {
    nombre: texto(producto.nombre),
    codigo: texto(producto.codigo),
    codigoBarras: texto(producto.codigoBarras),
    codigoFabricante: texto(producto.codigoFabricante),
    descripcion: texto(producto.descripcion),
    marca: texto(producto.marca),
    categoria: nombreCategoria(producto),
    unidadMedida: texto(producto.unidadMedida),
    usaMedida: producto.usaMedida === true,
    precioVenta: texto(producto.precioVenta),
    precioCosto: texto(producto.precioCosto),
    margen: texto(producto.margen),
    stockActual: texto(producto.stockActual),
    stockMinimo: texto(producto.stockMinimo),
    activo: producto.activo !== false,
    imagenUrl: texto(producto.imagenUrl),
    motivo: '',
  };
}

const numero = (valor: string | boolean | undefined) => Number(String(valor ?? '').trim());
const esNumeroValido = (valor: string | boolean | undefined) => String(valor ?? '').trim() !== '' && Number.isFinite(numero(valor));

/** Errores de validación antes de guardar: clave de campo y motivo (claves para traducir). */
export function validarFormularioProducto(form: FormularioProducto, original: any): { campo: string; motivo: string }[] {
  const errores: { campo: string; motivo: string }[] = [];
  if (!String(form.nombre ?? '').trim()) errores.push({ campo: 'nombre', motivo: 'requerido' });
  if (!String(form.codigo ?? '').trim()) errores.push({ campo: 'codigo', motivo: 'requerido' });
  if (String(form.codigoBarras ?? '').trim().length > 100) errores.push({ campo: 'codigoBarras', motivo: 'largo' });
  if (String(form.marca ?? '').trim().length > 100) errores.push({ campo: 'marca', motivo: 'largo' });
  if (String(form.categoria ?? '').trim().length > 100) errores.push({ campo: 'categoria', motivo: 'largo' });
  for (const campo of ['precioVenta', 'precioCosto'] as const) {
    if (!esNumeroValido(form[campo])) errores.push({ campo, motivo: 'numero' });
    else if (numero(form[campo]) < 0) errores.push({ campo, motivo: 'negativo' });
  }
  if (String(form.margen ?? '').trim() !== '' && (!esNumeroValido(form.margen) || numero(form.margen) < 0 || numero(form.margen) > 100)) {
    errores.push({ campo: 'margen', motivo: 'rango' });
  }
  for (const campo of ['stockActual', 'stockMinimo'] as const) {
    if (!esNumeroValido(form[campo])) errores.push({ campo, motivo: 'numero' });
    else if (numero(form[campo]) < 0) errores.push({ campo, motivo: 'negativo' });
  }
  if (!original) errores.push({ campo: 'nombre', motivo: 'sin_producto' });
  return errores;
}

/**
 * Payload parcial para PUT /productos/:id. Incluye `version` (control de concurrencia),
 * solo los campos modificados y, si cambian las existencias, el motivo.
 * `sensibles` lista los campos que requieren confirmación explícita.
 */
export function construirCambiosProducto(original: any, form: FormularioProducto) {
  const payload: Record<string, unknown> = {};
  const cambiados: string[] = [];

  const nombre = String(form.nombre ?? '').trim();
  if (nombre !== texto(original.nombre).trim()) { payload.nombre = nombre; cambiados.push('nombre'); }
  const codigo = String(form.codigo ?? '').trim().toUpperCase();
  if (codigo !== texto(original.codigo).toUpperCase()) { payload.codigo = codigo; cambiados.push('codigo'); }

  // Campos opcionales de texto: vacío explícito borra; el API lo normaliza a null.
  const barras = String(form.codigoBarras ?? '').trim();
  if (barras !== texto(original.codigoBarras).trim()) { payload.codigoBarras = barras; cambiados.push('codigoBarras'); }
  const fabricante = String(form.codigoFabricante ?? '').trim();
  if (fabricante !== texto(original.codigoFabricante).trim()) { payload.codigoFabricante = fabricante; cambiados.push('codigoFabricante'); }
  const descripcion = String(form.descripcion ?? '').trim();
  if (descripcion !== texto(original.descripcion).trim()) { payload.descripcion = descripcion; cambiados.push('descripcion'); }

  // Marca y categoría: vacío significa "sin cambio" (regla del API en actualizaciones parciales).
  const marca = String(form.marca ?? '').trim();
  if (marca && marca !== texto(original.marca).trim()) { payload.marca = marca; cambiados.push('marca'); }
  const categoria = String(form.categoria ?? '').trim();
  if (categoria && categoria !== nombreCategoria(original).trim()) { payload.categoria = categoria; cambiados.push('categoria'); }

  const unidad = String(form.unidadMedida ?? '');
  if (unidad && unidad !== texto(original.unidadMedida)) { payload.unidadMedida = unidad; cambiados.push('unidadMedida'); }
  if (form.usaMedida !== Boolean(original.usaMedida)) { payload.usaMedida = form.usaMedida === true; cambiados.push('usaMedida'); }

  for (const campo of ['precioVenta', 'precioCosto', 'stockMinimo'] as const) {
    if (esNumeroValido(form[campo]) && numero(form[campo]) !== Number(original[campo])) { payload[campo] = numero(form[campo]); cambiados.push(campo); }
  }
  if (String(form.margen ?? '').trim() !== '' && numero(form.margen) !== Number(original.margen ?? NaN)) {
    payload.margen = numero(form.margen); cambiados.push('margen');
  }

  const imagen = String(form.imagenUrl ?? '').trim();
  if (imagen !== texto(original.imagenUrl).trim()) { payload.imagenUrl = imagen || null; cambiados.push('imagenUrl'); }

  if (form.activo !== (original.activo !== false)) { payload.activo = form.activo === true; cambiados.push('activo'); }

  // Existencias: solo se envían si cambiaron, para no reescribir un valor leído antes.
  if (esNumeroValido(form.stockActual) && numero(form.stockActual) !== Number(original.stockActual)) {
    payload.stockActual = numero(form.stockActual);
    payload.motivo = String(form.motivo ?? '').trim();
    cambiados.push('stockActual');
  }

  const sensibles = cambiados.filter(campo => (CAMPOS_SENSIBLES as readonly string[]).includes(campo));
  return { payload: { ...payload, version: original.version }, cambiados, sensibles };
}
