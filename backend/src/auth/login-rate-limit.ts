import { HttpException, HttpStatus } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConfiguracionAuth } from './auth-config';

// Contadores compartidos en PostgreSQL: funcionan con varias instancias de la API.
// El tiempo lo marca el servidor de base de datos (now()), no cada instancia.
// La respuesta es la misma exista o no la cuenta, para no revelar correos registrados.

const MENSAJE = 'Demasiados intentos de inicio de sesión. Espere antes de volver a intentarlo.';
const hash = (valor: string) => createHash('sha256').update(valor).digest('hex');

export interface ClavesLogin {
  cuenta: string;
  ip: string;
}

export function clavesDeLogin(email: unknown, ip: string | undefined): ClavesLogin {
  const correo = typeof email === 'string' ? email.toLowerCase().trim() : '';
  return { cuenta: `cuenta:${hash(correo)}`, ip: `ip:${hash(ip || 'desconocida')}` };
}

/** Segundos que faltan para desbloquear, o 0 si el inicio de sesión está permitido. */
export async function segundosBloqueados(prisma: PrismaService, claves: ClavesLogin): Promise<number> {
  const [fila] = await prisma.$queryRaw<{ segundos: number | null }[]>`
    SELECT CEIL(EXTRACT(EPOCH FROM (MAX(bloqueado_hasta) - now())))::int AS segundos
    FROM intentos_login
    WHERE clave IN (${claves.cuenta}, ${claves.ip}) AND bloqueado_hasta > now()`;
  return Number(fila?.segundos ?? 0);
}

export function excepcionLimiteLogin(segundos: number): HttpException {
  return new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message: MENSAJE, reintentarEnSegundos: segundos }, HttpStatus.TOO_MANY_REQUESTS);
}

/** Cuenta un fallo para la cuenta y para la IP. Al llegar al máximo, bloquea durante `bloqueoSegundos`. */
export async function registrarFalloLogin(prisma: PrismaService, claves: ClavesLogin, cfg: ConfiguracionAuth): Promise<void> {
  const contar = (clave: string, maximo: number) => prisma.$executeRaw`
    INSERT INTO intentos_login (clave, fallos, ventana_inicio, bloqueado_hasta, actualizado_at)
    VALUES (${clave}, 1, now(), CASE WHEN 1 >= ${maximo}::int THEN now() + make_interval(secs => ${cfg.bloqueoSegundos}::double precision) END, now())
    ON CONFLICT (clave) DO UPDATE SET
      fallos = CASE WHEN intentos_login.ventana_inicio < now() - make_interval(secs => ${cfg.ventanaSegundos}::double precision)
                    THEN 1 ELSE intentos_login.fallos + 1 END,
      ventana_inicio = CASE WHEN intentos_login.ventana_inicio < now() - make_interval(secs => ${cfg.ventanaSegundos}::double precision)
                            THEN now() ELSE intentos_login.ventana_inicio END,
      bloqueado_hasta = CASE
        WHEN intentos_login.bloqueado_hasta > now() THEN intentos_login.bloqueado_hasta
        WHEN (CASE WHEN intentos_login.ventana_inicio < now() - make_interval(secs => ${cfg.ventanaSegundos}::double precision)
                   THEN 1 ELSE intentos_login.fallos + 1 END) >= ${maximo}::int
          THEN now() + make_interval(secs => ${cfg.bloqueoSegundos}::double precision)
        ELSE NULL END,
      actualizado_at = now()`;
  await contar(claves.cuenta, cfg.maxFallosCuenta);
  await contar(claves.ip, cfg.maxFallosIp);
  // Limpieza de filas antiguas y no bloqueadas (acotada por el índice de actualizado_at).
  await prisma.$executeRaw`DELETE FROM intentos_login WHERE actualizado_at < now() - interval '1 day' AND (bloqueado_hasta IS NULL OR bloqueado_hasta < now())`;
}

/** Un inicio correcto reinicia solo el contador de la cuenta; el de la IP sigue vigente. */
export async function registrarExitoLogin(prisma: PrismaService, claves: ClavesLogin): Promise<void> {
  await prisma.$executeRaw`DELETE FROM intentos_login WHERE clave = ${claves.cuenta}`;
}
