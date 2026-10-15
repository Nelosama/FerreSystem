import { query } from './ledger';
import type { Tx } from './ledger';

/** Página de 100 eventos de auditoría de UN negocio. Única consulta usada por tenant y Super Admin. */
export function consultarAuditoria(tx: Tx, tenantId: string, page: number) {
  return query(tx, 'SELECT a.*,u.nombre AS usuario_nombre FROM auditoria_operaciones a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE a.tenant_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 100 OFFSET $2', tenantId, Math.max(0, Math.floor(Number.isFinite(page) ? page : 0)) * 100);
}
