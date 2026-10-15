/**
 * Plazo de crédito del cliente en días (PATCH /clientes/:id/credito, campo plazoCreditoDias).
 * Las facturas a crédito nuevas vencen según este plazo. Vacío = sin plazo (null); si no, entero de 1 a 365,
 * los mismos límites que valida el backend (UpdateCreditoClienteDto).
 */
export type PlazoCredito = { ok: true; valor: number | null } | { ok: false; error: string };

export function leerPlazoCredito(texto: string): PlazoCredito {
  const limpio = texto.trim();
  if (limpio === '') return { ok: true, valor: null };
  if (!/^\d+$/.test(limpio)) return { ok: false, error: 'El plazo debe ser un número entero de días (1 a 365), o vacío para no fijar plazo.' };
  const valor = Number(limpio);
  if (valor < 1 || valor > 365) return { ok: false, error: 'El plazo debe estar entre 1 y 365 días, o vacío para no fijar plazo.' };
  return { ok: true, valor };
}
