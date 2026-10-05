import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BackupStatusController } from './backup-status.controller';

describe('Estado administrativo del respaldo', () => {
  let directory: string;
  const backupDirectory = 'ferresystem-fixture';
  const sha256 = 'a'.repeat(64);
  const controller = new BackupStatusController();
  const writeStatus = (overrides: Record<string, unknown> = {}) => writeFileSync(join(directory, 'latest-status.json'), JSON.stringify({
    lastAttempt: new Date().toISOString(), success: true, backupDirectory, sha256, ...overrides,
  }));
  const writeManifest = (overrides: Record<string, unknown> = {}) => writeFileSync(join(directory, backupDirectory, 'manifest.json'), JSON.stringify({
    archiveReadable: true, bytes: 42, sha256, restoreTested: false, ...overrides,
  }));

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'ferre-backup-status-'));
    mkdirSync(join(directory, backupDirectory));
    vi.stubEnv('FERRE_BACKUP_STATUS_FILE', join(directory, 'latest-status.json'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  });

  it('distingue falta de configuración de fallo de lectura', async () => {
    expect(await controller.status()).toEqual({ configured: true, available: false });
    vi.stubEnv('FERRE_BACKUP_STATUS_FILE', '');
    expect(await controller.status()).toEqual({ configured: false });
  });

  it('informa antigüedad sin publicar rutas ni campos privados', async () => {
    const lastAttempt = new Date(Date.now() - 86400000).toISOString();
    writeStatus({ lastAttempt, private: 'omitido', restoreTested: true });
    writeManifest({ private: 'omitido' });
    expect(await controller.status()).toEqual({
      configured: true, available: true, lastAttempt, success: true, stale: true, restoreTested: false,
    });
  });

  it('refleja la evidencia de restore-verify sin reescribir el estado del programador', async () => {
    writeStatus();
    writeManifest();
    expect(await controller.status()).toMatchObject({ available: true, success: true, restoreTested: false });
    writeManifest({ restoreTested: true, restoreVerification: {
      verifiedAt: new Date().toISOString(),
      counts: { tenants: '1', usuarios: '2', productos: '0', clientes: '0', ventas: '0' },
      note: 'Información que no debe salir en la respuesta',
    } });
    const status = await controller.status();
    expect(status).toMatchObject({ available: true, success: true, restoreTested: true });
    expect(status).not.toHaveProperty('backupDirectory');
    expect(status).not.toHaveProperty('sha256');
    expect(status).not.toHaveProperty('restoreVerification');
  });

  it('no acepta solo una bandera de restauración sin evidencia técnica', async () => {
    writeStatus({ restoreTested: true });
    writeManifest({ restoreTested: true });
    expect(await controller.status()).toMatchObject({ available: true, restoreTested: false });
  });

  it('rechaza evidencia ausente o perteneciente a otro respaldo', async () => {
    writeStatus();
    expect(await controller.status()).toEqual({ configured: true, available: false });
    writeManifest({ sha256: 'b'.repeat(64), restoreTested: true });
    expect(await controller.status()).toEqual({ configured: true, available: false });
  });

  it('mantiene visible el fallo del último intento sin heredar una restauración anterior', async () => {
    const lastAttempt = new Date().toISOString();
    writeStatus({ lastAttempt, success: false, restoreTested: true });
    expect(await controller.status()).toEqual({
      configured: true, available: true, lastAttempt, success: false, stale: false, restoreTested: false,
    });
  });

  it.each(['../outside', '/outside', 'ferresystem-fixture/../../outside', 'ferresystem-fixture\\..\\outside'])('rechaza referencias de manifiesto fuera de la carpeta (%s)', async value => {
    writeStatus({ backupDirectory: value });
    expect(await controller.status()).toEqual({ configured: true, available: false });
  });

  it.skipIf(process.platform === 'win32')('rechaza manifiestos enlazados a otra carpeta', async () => {
    const outside = join(directory, 'outside-manifest.json');
    writeFileSync(outside, JSON.stringify({ archiveReadable: true, bytes: 42, sha256, restoreTested: true }));
    symlinkSync(outside, join(directory, backupDirectory, 'manifest.json'));
    writeStatus();
    expect(await controller.status()).toEqual({ configured: true, available: false });
  });
});
