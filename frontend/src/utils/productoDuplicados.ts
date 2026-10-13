// Detecta posibles productos duplicados por nombre. Solo advierte: las variantes pueden compartir nombre.
const normalizarNombre = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

export function posiblesDuplicados<T extends { nombre: string; codigo: string }>(nombre: string, productos: T[], limite = 3): T[] {
  const buscado = normalizarNombre(nombre);
  if (!buscado) return [];
  return productos.filter(p => normalizarNombre(p.nombre) === buscado).slice(0, limite);
}
