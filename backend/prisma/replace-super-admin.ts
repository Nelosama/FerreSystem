// Retired: deleting and recreating the platform identity invalidates its audit/session references.
// Fail before constructing PrismaClient or reading credentials.
console.error('Comando retirado. Use admin:recover-super-admin y docs/AUTH_RECOVERY_SECURITY.md; no se modificó ninguna cuenta.');
process.exitCode = 1;
