/**
 * Edición de proveedores (PATCH /proveedores/:id, solo ADMIN). Envía únicamente los campos que cambiaron;
 * una cadena vacía borra un dato opcional en el servidor. El nombre es obligatorio.
 */
export type ProveedorDatos = { nombre: string; rtn: string; telefono: string; email: string; contacto: string; direccion: string };
export const CAMPOS_PROVEEDOR = ['nombre', 'rtn', 'telefono', 'email', 'contacto', 'direccion'] as const;

export function datosProveedor(p: Partial<Record<keyof ProveedorDatos, string | null>>): ProveedorDatos {
  return Object.fromEntries(CAMPOS_PROVEEDOR.map((c) => [c, p[c] ?? ''])) as ProveedorDatos;
}

export function cambiosProveedor(anterior: ProveedorDatos, nuevo: ProveedorDatos): { ok: true; cambios: Partial<ProveedorDatos> } | { ok: false; error: string } {
  if (!nuevo.nombre.trim()) return { ok: false, error: 'El nombre del proveedor es obligatorio.' };
  const cambios: Partial<ProveedorDatos> = {};
  for (const campo of CAMPOS_PROVEEDOR) {
    const valor = nuevo[campo].trim();
    if (valor !== anterior[campo].trim()) cambios[campo] = valor;
  }
  return { ok: true, cambios };
}
