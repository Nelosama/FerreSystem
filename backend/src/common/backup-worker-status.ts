const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const codes = new Set(['RUNNING', 'DUMP', 'UPLOAD', 'INTEGRITY', 'RESTORE', 'RETENTION']);
type RecordValue = Record<string, unknown>;
function execution(value: RecordValue) {
  if (!date(value.lastAttempt) || typeof value.success !== 'boolean') return null;
  const verified = value.success && value.encrypted === true && value.destinationVerified === true &&
    value.restoreTested === true && date(value.verifiedAt) &&
    /^[a-f0-9]{64}$/.test(String(value.snapshot)) && /^[a-f0-9]{64}$/.test(String(value.sha256));
  return { lastAttempt: value.lastAttempt, success: !!verified,
    errorCode: codes.has(String(value.errorCode)) ? String(value.errorCode) : undefined,
    restoreTested: !!verified,
    alertDelivery: ['configured', 'delivered', 'failed', 'unconfigured'].includes(String(value.alertDelivery)) ? value.alertDelivery as string : 'unconfigured',
  };
}
export function workerStatus(saved: RecordValue) {
  const latest = execution(saved);
  if (!latest) return { configured: true, available: false };
  const maximum = Number(process.env.FERRE_BACKUP_MAX_AGE_SECONDS || 172800);
  const limit = Number.isFinite(maximum) && maximum >= 60 ? maximum : 172800;
  const age = Date.now() - Date.parse(latest.lastAttempt);
  const history = Array.isArray(saved.history) ? saved.history.slice(-50)
    .filter((item): item is RecordValue => !!item && typeof item === 'object')
    .map(execution).filter(Boolean).reverse() : [];
  return { configured: true, available: true, ...latest,
    stale: age > limit * 1000 || age < -300000,
    lastSuccess: date(saved.lastSuccess) ? saved.lastSuccess : null,
    encrypted: latest.success, destinationVerified: latest.success, history,
  };
}
