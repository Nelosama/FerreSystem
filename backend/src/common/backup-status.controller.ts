import { Controller, Get, UseGuards } from '@nestjs/common';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenantGuard } from './guards/tenant.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
@Controller('maintenance')
@UseGuards(JwtAuthGuard,TenantGuard,RolesGuard)
@Roles('ADMIN')
export class BackupStatusController {
  @Get('backup')
  async status() {
    const file = process.env.FERRE_BACKUP_STATUS_FILE;
    if (!file) return { configured: false };
    try {
      const saved = JSON.parse(await readFile(file, 'utf8'));
      if (typeof saved.success !== 'boolean' || typeof saved.lastAttempt !== 'string' || Number.isNaN(Date.parse(saved.lastAttempt))) {
        return { configured: true, available: false };
      }
      let restoreTested = false;
      if (saved.success) {
        if (typeof saved.backupDirectory !== 'string' || !/^ferresystem-[A-Za-z0-9-]+$/.test(saved.backupDirectory) || !/^[0-9a-f]{64}$/.test(saved.sha256 || '')) {
          return { configured: true, available: false };
        }
        const root = await realpath(dirname(file));
        const expected = join(root, saved.backupDirectory, 'manifest.json');
        // La referencia debe ser un archivo de esa carpeta, sin symlinks que
        // permitan leer manifiestos ajenos al directorio privado de respaldos.
        if (await realpath(expected) !== expected) return { configured: true, available: false };
        const manifest = JSON.parse(await readFile(expected, 'utf8'));
        if (manifest.archiveReadable !== true || manifest.sha256 !== saved.sha256 || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0) {
          return { configured: true, available: false };
        }
        const verification = manifest.restoreVerification;
        restoreTested = manifest.restoreTested === true && typeof verification?.verifiedAt === 'string' && !Number.isNaN(Date.parse(verification.verifiedAt)) &&
          ['tenants', 'usuarios', 'productos', 'clientes', 'ventas'].every(table => typeof verification?.counts?.[table] === 'string' && /^\d+$/.test(verification.counts[table]));
      }
      const maximum = Number(process.env.FERRE_BACKUP_MAX_AGE_SECONDS || 43200);
      const age = Date.now() - Date.parse(saved.lastAttempt);
      const limit = Number.isFinite(maximum) && maximum >= 60 ? maximum : 43200;
      return { configured: true, available: true, lastAttempt: saved.lastAttempt, success: saved.success, stale: age > limit * 1000 || age < -300000, restoreTested };
    } catch { return { configured: true, available: false }; }
  }
}
