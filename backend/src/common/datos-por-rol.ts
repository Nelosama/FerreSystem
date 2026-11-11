// Datos de cliente y de empresa que una respuesta de venta o cotización puede llevar, según el rol que la recibe.
// Regla (la misma de GET /clientes/buscar): saldos, límites y plazos de crédito son información administrativa.
// Fuera de ADMIN, una venta solo lleva los datos comerciales del cliente; una cotización añade el contacto que se imprime
// en el documento. La empresa nunca viaja completa: su configuración interna no forma parte de un comprobante.

const COMERCIAL = ['id', 'numeroCliente', 'codigo', 'nombre', 'rtn', 'telefono', 'creditoHabilitado'] as const;
const CONTACTO = ['email', 'direccion', 'tipo'] as const;
const EMPRESA = ['id', 'nombreComercial', 'direccion', 'telefono', 'email', 'logoUrl', 'colorPrimario'] as const;

const tomar = (origen: Record<string, unknown>, campos: readonly string[]) =>
  Object.fromEntries(campos.filter((campo) => campo in origen).map((campo) => [campo, origen[campo]]));

/** Cliente anidado en una respuesta. ADMIN lo recibe completo; los demás roles, sin datos de crédito ni notas internas. */
export function clienteParaRol<T extends Record<string, unknown>>(cliente: T | null | undefined, rol: string | undefined, conContacto = false) {
  if (!cliente) return cliente ?? null;
  if (rol === 'ADMIN') return cliente;
  return tomar(cliente, conContacto ? [...COMERCIAL, ...CONTACTO] : COMERCIAL);
}

/** Datos de la empresa que aparecen en un comprobante. Nunca incluye configuración, plan, estado ni claves de almacenamiento. */
export function empresaPublica<T extends Record<string, unknown>>(empresa: T | null | undefined) {
  return empresa ? tomar(empresa, EMPRESA) : undefined;
}

/** Roles de mostrador: consultan el detalle completo solo de las ventas que ellos registraron. */
export const ROLES_SOLO_VENTAS_PROPIAS: readonly string[] = ['CAJERO', 'VENDEDOR'];
export const soloVentasPropias = (rol: string | undefined) => ROLES_SOLO_VENTAS_PROPIAS.includes(String(rol));
