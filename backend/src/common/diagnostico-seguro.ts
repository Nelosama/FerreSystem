/**
 * Resumen de un error apto para los registros: tipo, código Prisma (P0000) y la primera línea del mensaje, acotada.
 * Los errores de invocación de Prisma incluyen los argumentos de la consulta (nombres, RTN, importes) a partir
 * de la segunda línea; nunca se registran.
 */
export function diagnosticoSeguro(error: unknown): string {
  const e = error as { name?: unknown; code?: unknown; message?: unknown } | null | undefined;
  const nombre = typeof e?.name === 'string' ? e.name : 'Error';
  const codigo = typeof e?.code === 'string' && /^P\d{4}$/.test(e.code) ? ` ${e.code}` : '';
  const primera = typeof e?.message === 'string' ? e.message.split('\n').map(l => l.trim()).find(Boolean) ?? '' : '';
  const linea = /invocation/i.test(primera) ? 'invocación de Prisma rechazada' : primera.slice(0, 200);
  return `${nombre}${codigo}${linea ? `: ${linea}` : ''}`;
}
