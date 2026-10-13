import { createHash } from 'node:crypto';

// Identificador interno derivado por empresa (D3 de CENTINELA). Mismo algoritmo que backend/src/operaciones/ledger.ts.
export function idDerivado(tenantId: string, solicitudId: string): string {
  const etiqueta = (c: string) => createHash('sha256').update(`ferresystem:id-interno:v1:${c}`).digest('hex').slice(0, 12);
  const h = createHash('sha256').update(`ferresystem:solicitud:v1:${tenantId}:${solicitudId}`).digest('hex');
  const variante = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  const cuerpo = `${h.slice(0, 8)}${h.slice(8, 12)}4${h.slice(13, 16)}${variante}${h.slice(18, 20)}`;
  const crudo = `${cuerpo}${etiqueta(cuerpo)}`;
  return `${crudo.slice(0, 8)}-${crudo.slice(8, 12)}-${crudo.slice(12, 16)}-${crudo.slice(16, 20)}-${crudo.slice(20, 32)}`;
}
