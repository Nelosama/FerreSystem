import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZONA_HORARIA_NEGOCIO, diaCalendario, rangoDiasEnZona } from '../common/zona-horaria';
import { audit, authorizedActor, id, lockTenant, query, type Tx } from './ledger';

// Conciliación diaria del POS bancario (solo ADMIN). Compara el total que muestra el cierre del banco con las
// autorizaciones de tarjeta registradas por esa terminal en el día de negocio. Las diferencias exigen motivo
// y quedan guardadas y auditadas. Una conciliación por terminal y día.
export interface ConciliacionDto {
  solicitudId: string; terminal: string; fecha: string; totalBanco: number; cantidadBanco: number; motivo?: string | null;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

export async function registrarConciliacion(prisma: PrismaService, tenantId: string, usuarioId: string, dto: ConciliacionDto) {
  return prisma.$transaction(async tx => {
    await lockTenant(tx, tenantId);
    await authorizedActor(tx, tenantId, usuarioId, ['ADMIN']);
    const terminal = (dto.terminal ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{1,40}$/.test(terminal)) throw new BadRequestException('Indique la terminal del POS bancario');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.fecha) || Number.isNaN(Date.parse(dto.fecha))) throw new BadRequestException('Fecha inválida');
    const hoy = diaCalendario(new Date());
    if (dto.fecha > hoy) throw new BadRequestException('No se concilia un día posterior a hoy');

    // Reintento con la misma solicitud: devuelve el registro original; otros datos responden 409.
    const [previo] = await query(tx, 'SELECT id, terminal, fecha::text AS fecha, total_banco FROM conciliaciones_bancarias WHERE tenant_id=$1 AND solicitud_id=$2', tenantId, dto.solicitudId);
    if (previo) {
      if (previo.terminal !== terminal || previo.fecha !== dto.fecha || Number(previo.total_banco) !== centavos(dto.totalBanco)) {
        throw new ConflictException('La solicitud ya fue utilizada para otra conciliación');
      }
      return previo;
    }
    const [mismoDia] = await query(tx, 'SELECT id FROM conciliaciones_bancarias WHERE tenant_id=$1 AND terminal=$2 AND fecha=$3::date', tenantId, terminal, dto.fecha);
    if (mismoDia) throw new ConflictException('Ya existe una conciliación de esa terminal para ese día');

    const { inicio, fin } = rangoDiasEnZona(dto.fecha, dto.fecha, ZONA_HORARIA_NEGOCIO);
    const [sistema] = await query(tx,
      `SELECT COALESCE(SUM(monto),0)::text AS total, COUNT(*)::int AS cantidad FROM aprobaciones_bancarias
        WHERE tenant_id=$1 AND metodo='TARJETA' AND terminal=$2
          AND created_at>=($3::timestamptz AT TIME ZONE 'UTC') AND created_at<($4::timestamptz AT TIME ZONE 'UTC')`,
      tenantId, terminal, inicio.toISOString(), fin.toISOString());
    const totalSistema = centavos(Number(sistema.total));
    const totalBanco = centavos(dto.totalBanco);
    const diferencia = centavos(totalBanco - totalSistema);
    const motivo = (dto.motivo ?? '').trim();
    if (diferencia !== 0 && motivo.length < 10) {
      throw new BadRequestException('Explique la diferencia entre el POS bancario y el sistema (mínimo 10 caracteres)');
    }
    const [fila] = await query(tx,
      `INSERT INTO conciliaciones_bancarias (id,tenant_id,terminal,fecha,total_banco,cantidad_banco,total_sistema,cantidad_sistema,diferencia,motivo,solicitud_id,usuario_id)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      id(), tenantId, terminal, dto.fecha, totalBanco, dto.cantidadBanco, totalSistema, sistema.cantidad,
      diferencia, diferencia === 0 ? null : motivo, dto.solicitudId, usuarioId);
    await audit(tx, tenantId, usuarioId, 'CONCILIACION_BANCARIA', fila.id, {
      terminal, fecha: dto.fecha, totalBanco, cantidadBanco: dto.cantidadBanco, totalSistema,
      cantidadSistema: sistema.cantidad, diferencia, motivo: diferencia === 0 ? null : motivo,
    });
    return fila;
  });
}

export async function listarConciliaciones(prisma: PrismaService, tenantId: string, usuarioId: string, fecha?: string) {
  return prisma.$transaction(async tx => {
    await authorizedActor(tx as unknown as Tx, tenantId, usuarioId, ['ADMIN']);
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new BadRequestException('Fecha inválida');
    return query(tx as unknown as Tx,
      `SELECT c.id, c.terminal, c.fecha, c.total_banco, c.cantidad_banco, c.total_sistema, c.cantidad_sistema, c.diferencia, c.motivo,
              c.created_at, u.nombre AS usuario_nombre
         FROM conciliaciones_bancarias c JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.tenant_id=$1 AND ($2::date IS NULL OR c.fecha=$2::date)
        ORDER BY c.fecha DESC, c.terminal`,
      tenantId, fecha ?? null);
  });
}
