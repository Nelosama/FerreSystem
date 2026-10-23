// Resumen de cuentas por cobrar y por pagar para el inicio del administrador. Funciones puras sobre la respuesta de
// GET /operaciones/cuentas?tipo=CXC|CXP (que también devuelve las cuentas ya pagadas). No inventa cifras: una respuesta
// que no sea una lista lanza un error y el inicio lo muestra como fallo, nunca como «sin cuentas».

export interface ResumenCuentas {
  /** Cuentas con saldo mayor que cero. */
  abiertas: number;
  /** Suma de los saldos abiertos, redondeada a centavos. */
  saldo: number;
  /** Abiertas que el servidor marca como vencidas. */
  vencidas: number;
  saldoVencido: number;
  /** Vencimiento (YYYY-MM-DD) más cercano entre las abiertas aún no vencidas. */
  proximoVencimiento: string | null;
}

const centavos = (valor: number) => Math.round(valor * 100) / 100;

const saldoDe = (fila: Record<string, unknown>): number | null => {
  const n = typeof fila.saldo === 'number' ? fila.saldo : typeof fila.saldo === 'string' && fila.saldo.trim() !== '' ? Number(fila.saldo) : NaN;
  return Number.isFinite(n) ? n : null;
};

const DIA = /^\d{4}-\d{2}-\d{2}/;

export function resumirCuentas(raw: unknown): ResumenCuentas {
  if (!Array.isArray(raw)) throw new Error('Respuesta de cuentas no válida');
  let saldo = 0;
  let abiertas = 0;
  let vencidas = 0;
  let saldoVencido = 0;
  let proximo: string | null = null;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const fila = item as Record<string, unknown>;
    const monto = saldoDe(fila);
    if (monto === null || monto <= 0) continue;
    abiertas += 1;
    saldo += monto;
    if (fila.vencida === true) {
      vencidas += 1;
      saldoVencido += monto;
    } else if (typeof fila.vencimiento === 'string' && DIA.test(fila.vencimiento)) {
      const dia = fila.vencimiento.slice(0, 10);
      if (proximo === null || dia < proximo) proximo = dia;
    }
  }
  return { abiertas, saldo: centavos(saldo), vencidas, saldoVencido: centavos(saldoVencido), proximoVencimiento: proximo };
}

/** Días calendario entre dos días YYYY-MM-DD (aritmética UTC: no depende de la zona del navegador). */
export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** YYYY-MM-DD → DD/MM/AAAA, el formato de fecha del negocio. */
export const fechaCorta = (dia: string) => {
  const [anio, mes, diaMes] = dia.slice(0, 10).split('-');
  return `${diaMes}/${mes}/${anio}`;
};
