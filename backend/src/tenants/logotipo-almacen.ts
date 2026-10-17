import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Almacenamiento privado de logotipos. Solo recibe claves generadas por el servidor a partir del
 * identificador del negocio; nunca rutas o nombres enviados por el cliente.
 */
export interface AlmacenLogotipo {
  readonly nombre: string;
  guardar(clave: string, datos: Buffer, mime: string): Promise<void>;
  leer(clave: string): Promise<Buffer | null>;
  eliminar(clave: string): Promise<void>;
}

const IDENTIFICADOR_NEGOCIO = /^[A-Za-z0-9_-]{1,64}$/;

/** Clave privada por negocio: `tenants/{tenantId}/logo`. El tipo se guarda en PostgreSQL. */
export function claveLogotipo(tenantId: string): string {
  if (!IDENTIFICADOR_NEGOCIO.test(tenantId)) throw new Error('Identificador de negocio inválido para el almacenamiento');
  return `tenants/${tenantId}/logo`;
}

/** Driver de disco. Pensado para un volumen persistente del servidor (p. ej. disco de Render), no para el disco efímero. */
export class AlmacenLogotipoLocal implements AlmacenLogotipo {
  readonly nombre = 'local';
  private readonly raiz: string;

  constructor(directorio: string) {
    if (!isAbsolute(directorio)) throw new Error('LOGOTIPO_DIRECTORIO debe ser una ruta absoluta');
    this.raiz = resolve(directorio);
  }

  private rutaSegura(clave: string): string {
    const destino = resolve(this.raiz, clave);
    if (!destino.startsWith(this.raiz + sep)) throw new Error('Clave de almacenamiento fuera del directorio privado');
    return destino;
  }

  async guardar(clave: string, datos: Buffer): Promise<void> {
    const destino = this.rutaSegura(clave);
    await mkdir(dirname(destino), { recursive: true, mode: 0o700 });
    const temporal = `${destino}.${process.pid}.tmp`;
    await writeFile(temporal, datos, { mode: 0o600 });
    await rename(temporal, destino);
  }

  async leer(clave: string): Promise<Buffer | null> {
    try {
      return await readFile(this.rutaSegura(clave));
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async eliminar(clave: string): Promise<void> {
    await rm(this.rutaSegura(clave), { force: true });
  }
}

/**
 * Driver de Supabase Storage con bucket PRIVADO. Usa la clave de servicio solo en el servidor;
 * el frontend nunca recibe credenciales ni URLs firmadas: el backend sirve los bytes tras autorizar.
 */
export class AlmacenLogotipoSupabase implements AlmacenLogotipo {
  readonly nombre = 'supabase';

  constructor(private readonly url: string, private readonly claveServicio: string, private readonly bucket: string, private readonly fetchImpl: typeof fetch = fetch) {}

  /** Subida y borrado: /storage/v1/object/{bucket}/{clave}. Lectura autenticada: .../object/authenticated/{bucket}/{clave}. */
  private ruta(clave: string, segmento?: 'authenticated') {
    return `${this.url.replace(/\/$/, '')}/storage/v1/object/${segmento ? `${segmento}/` : ''}${this.bucket}/${clave}`;
  }

  private cabeceras(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.claveServicio}`, apikey: this.claveServicio, ...extra };
  }

  private async peticion(url: string, init: RequestInit) {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new ServiceUnavailableException('El almacenamiento de logotipos no responde. Intente de nuevo.');
    }
  }

  async guardar(clave: string, datos: Buffer, mime: string): Promise<void> {
    const respuesta = await this.peticion(this.ruta(clave), {
      method: 'POST',
      headers: this.cabeceras({ 'Content-Type': mime, 'x-upsert': 'true', 'Cache-Control': 'no-cache' }),
      body: new Uint8Array(datos),
    });
    if (!respuesta.ok) throw new ServiceUnavailableException('No se pudo guardar el logotipo en el almacenamiento');
  }

  async leer(clave: string): Promise<Buffer | null> {
    const respuesta = await this.peticion(this.ruta(clave, 'authenticated'), { method: 'GET', headers: this.cabeceras() });
    if (respuesta.status === 404) return null;
    if (!respuesta.ok) throw new ServiceUnavailableException('No se pudo leer el logotipo del almacenamiento');
    return Buffer.from(await respuesta.arrayBuffer());
  }

  async eliminar(clave: string): Promise<void> {
    const respuesta = await this.peticion(this.ruta(clave), { method: 'DELETE', headers: this.cabeceras() });
    if (!respuesta.ok && respuesta.status !== 404) throw new ServiceUnavailableException('No se pudo eliminar el logotipo del almacenamiento');
  }
}

/**
 * Selecciona el driver según variables de entorno. Sin configuración devuelve null y los endpoints
 * responden 503: nunca se simula almacenamiento.
 */
export function crearAlmacenLogotipo(entorno: NodeJS.ProcessEnv = process.env): AlmacenLogotipo | null {
  const driver = (entorno.LOGOTIPO_ALMACEN ?? '').trim().toLowerCase();
  if (driver === 'local') {
    if (!entorno.LOGOTIPO_DIRECTORIO) throw new Error('LOGOTIPO_ALMACEN=local requiere LOGOTIPO_DIRECTORIO');
    return new AlmacenLogotipoLocal(entorno.LOGOTIPO_DIRECTORIO);
  }
  if (driver === 'supabase') {
    if (!entorno.SUPABASE_URL || !entorno.SUPABASE_SERVICE_KEY) throw new Error('LOGOTIPO_ALMACEN=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_KEY');
    return new AlmacenLogotipoSupabase(entorno.SUPABASE_URL, entorno.SUPABASE_SERVICE_KEY, entorno.SUPABASE_LOGOTIPO_BUCKET || 'logotipos-privados');
  }
  return null;
}

export const LOGOTIPO_ALMACEN = Symbol('LOGOTIPO_ALMACEN');
