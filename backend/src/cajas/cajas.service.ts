import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AbrirCajaDto } from './dto/abrir-caja.dto';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto';
import { CerrarCajaDto } from './dto/cerrar-caja.dto';

@Injectable()
export class CajasService {
  constructor(private prisma: PrismaService) {}

  async abrirCaja(tenantId: string, usuarioId: string, dto: AbrirCajaDto) {
    const cajaAbiertaExistente = await this.prisma.caja.findFirst({
      where: {
        tenantId,
        usuarioId,
        estado: 'ABIERTA',
      },
    });

    if (cajaAbiertaExistente) {
      throw new BadRequestException('El usuario ya cuenta con una caja abierta activa en esta sucursal');
    }

    const nuevaCaja = await this.prisma.caja.create({
      data: {
        tenantId,
        usuarioId,
        montoInicial: dto.montoInicial,
        estado: 'ABIERTA',
        observaciones: dto.observaciones || null,
      },
      include: {
        usuario: { select: { id: true, nombre: true, email: true } },
      },
    });

    return {
      ...nuevaCaja,
      montoInicial: Number(nuevaCaja.montoInicial),
      montoEsperado: nuevaCaja.montoEsperado ? Number(nuevaCaja.montoEsperado) : null,
      montoContado: nuevaCaja.montoContado ? Number(nuevaCaja.montoContado) : null,
      diferencia: nuevaCaja.diferencia ? Number(nuevaCaja.diferencia) : null,
    };
  }

  async obtenerCajaActual(tenantId: string, usuarioId: string) {
    const caja = await this.prisma.caja.findFirst({
      where: {
        tenantId,
        usuarioId,
        estado: 'ABIERTA',
      },
      include: {
        usuario: { select: { id: true, nombre: true, email: true } },
        movimientos: {
          include: { usuario: { select: { id: true, nombre: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!caja) {
      return { activa: false, caja: null, resumen: null };
    }

    // Consultar ventas vinculadas a esta caja o realizadas en la ventana de tiempo por el usuario
    const ventas = await this.prisma.venta.findMany({
      where: {
        tenantId,
        OR: [
          { cajaId: caja.id },
          {
            usuarioId: caja.usuarioId,
            createdAt: { gte: caja.fechaApertura },
            estado: 'COMPLETADA',
          },
        ],
      },
      include: {
        cliente: { select: { id: true, nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const resumen = this.calcularResumenCaja(caja, ventas, caja.movimientos);

    return {
      activa: true,
      caja: {
        ...caja,
        montoInicial: Number(caja.montoInicial),
        montoEsperado: Number(caja.montoEsperado ?? resumen.montoEsperado),
        montoContado: caja.montoContado ? Number(caja.montoContado) : null,
        diferencia: caja.diferencia ? Number(caja.diferencia) : null,
        movimientos: caja.movimientos.map((m) => ({
          ...m,
          monto: Number(m.monto),
        })),
      },
      resumen,
    };
  }

  async obtenerHistorial(tenantId: string, limit = 50) {
    const cajas = await this.prisma.caja.findMany({
      where: { tenantId },
      include: {
        usuario: { select: { id: true, nombre: true, email: true } },
        usuarioCierre: { select: { id: true, nombre: true, email: true } },
        _count: { select: { movimientos: true, ventas: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return cajas.map((c) => ({
      ...c,
      montoInicial: Number(c.montoInicial),
      montoEsperado: c.montoEsperado ? Number(c.montoEsperado) : null,
      montoContado: c.montoContado ? Number(c.montoContado) : null,
      diferencia: c.diferencia ? Number(c.diferencia) : null,
    }));
  }

  async obtenerCajaPorId(tenantId: string, id: string) {
    const caja = await this.prisma.caja.findFirst({
      where: { id, tenantId },
      include: {
        usuario: { select: { id: true, nombre: true, email: true } },
        usuarioCierre: { select: { id: true, nombre: true, email: true } },
        movimientos: {
          include: { usuario: { select: { id: true, nombre: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!caja) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }

    const ventas = await this.prisma.venta.findMany({
      where: {
        tenantId,
        OR: [
          { cajaId: caja.id },
          {
            usuarioId: caja.usuarioId,
            createdAt: {
              gte: caja.fechaApertura,
              ...(caja.fechaCierre ? { lte: caja.fechaCierre } : {}),
            },
            estado: 'COMPLETADA',
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    const resumen = this.calcularResumenCaja(caja, ventas, caja.movimientos);

    return {
      caja: {
        ...caja,
        montoInicial: Number(caja.montoInicial),
        montoEsperado: caja.montoEsperado ? Number(caja.montoEsperado) : resumen.montoEsperado,
        montoContado: caja.montoContado ? Number(caja.montoContado) : null,
        diferencia: caja.diferencia ? Number(caja.diferencia) : null,
        movimientos: caja.movimientos.map((m) => ({
          ...m,
          monto: Number(m.monto),
        })),
      },
      resumen,
    };
  }

  async crearMovimiento(
    tenantId: string,
    cajaId: string,
    usuarioId: string,
    dto: CrearMovimientoDto,
  ) {
    const caja = await this.prisma.caja.findFirst({
      where: { id: cajaId, tenantId },
    });

    if (!caja) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }

    if (caja.estado !== 'ABIERTA') {
      throw new BadRequestException('No se pueden registrar movimientos en una caja cerrada');
    }

    const movimiento = await this.prisma.movimientoCaja.create({
      data: {
        tenantId,
        cajaId: caja.id,
        usuarioId,
        tipo: dto.tipo,
        concepto: dto.concepto,
        monto: dto.monto,
        metodoPago: dto.metodoPago || 'EFECTIVO',
        observacion: dto.observacion || null,
      },
      include: {
        usuario: { select: { id: true, nombre: true } },
      },
    });

    return {
      ...movimiento,
      monto: Number(movimiento.monto),
    };
  }

  async obtenerMovimientos(tenantId: string, cajaId: string) {
    const caja = await this.prisma.caja.findFirst({
      where: { id: cajaId, tenantId },
    });

    if (!caja) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }

    const movimientos = await this.prisma.movimientoCaja.findMany({
      where: { cajaId: caja.id, tenantId },
      include: {
        usuario: { select: { id: true, nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return movimientos.map((m) => ({
      ...m,
      monto: Number(m.monto),
    }));
  }

  async cerrarCaja(
    tenantId: string,
    cajaId: string,
    usuarioCierreId: string,
    dto: CerrarCajaDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const caja = await tx.caja.findFirst({
        where: { id: cajaId, tenantId },
        include: { movimientos: true },
      });

      if (!caja) {
        throw new NotFoundException('Sesión de caja no encontrada');
      }

      if (caja.estado === 'CERRADA') {
        throw new BadRequestException('Esta sesión de caja ya fue cerrada previamente');
      }

      const fechaCierre = new Date();

      // Buscar todas las ventas del periodo
      const ventas = await tx.venta.findMany({
        where: {
          tenantId,
          OR: [
            { cajaId: caja.id },
            {
              usuarioId: caja.usuarioId,
              createdAt: { gte: caja.fechaApertura, lte: fechaCierre },
              estado: 'COMPLETADA',
            },
          ],
        },
      });

      // Vincular explícitamente las ventas a esta caja si no lo estaban
      const ventaIdsSinCaja = ventas.filter((v) => !v.cajaId).map((v) => v.id);
      if (ventaIdsSinCaja.length > 0) {
        await tx.venta.updateMany({
          where: { id: { in: ventaIdsSinCaja } },
          data: { cajaId: caja.id },
        });
      }

      const resumen = this.calcularResumenCaja(caja, ventas, caja.movimientos);

      const montoEsperado = resumen.montoEsperado;
      const montoContado = Math.round(dto.montoContado * 100) / 100;
      const diferencia = Math.round((montoContado - montoEsperado) * 100) / 100;

      let tipoDiferencia = 'CUADRADO';
      if (diferencia > 0.01) {
        tipoDiferencia = 'SOBRANTE';
      } else if (diferencia < -0.01) {
        tipoDiferencia = 'FALTANTE';
      }

      const cajaCerrada = await tx.caja.update({
        where: { id: caja.id },
        data: {
          estado: 'CERRADA',
          montoEsperado,
          montoContado,
          diferencia,
          tipoDiferencia,
          fechaCierre,
          usuarioCierreId,
          observaciones: dto.observaciones?.trim() || caja.observaciones,
        },
        include: {
          usuario: { select: { id: true, nombre: true, email: true } },
          usuarioCierre: { select: { id: true, nombre: true, email: true } },
          movimientos: {
            include: { usuario: { select: { id: true, nombre: true } } },
          },
        },
      });

      return {
        caja: {
          ...cajaCerrada,
          montoInicial: Number(cajaCerrada.montoInicial),
          montoEsperado: Number(cajaCerrada.montoEsperado),
          montoContado: Number(cajaCerrada.montoContado),
          diferencia: Number(cajaCerrada.diferencia),
          movimientos: cajaCerrada.movimientos.map((m) => ({
            ...m,
            monto: Number(m.monto),
          })),
        },
        resumen,
      };
    });
  }

  private calcularResumenCaja(caja: any, ventas: any[], movimientos: any[]) {
    const montoInicial = Number(caja.montoInicial || 0);

    let ventasEfectivo = 0;
    let ventasTarjeta = 0;
    let ventasTransferencia = 0;
    let ventasCredito = 0;
    let totalVentas = 0;

    for (const v of ventas) {
      const t = Number(v.total || 0);
      totalVentas += t;
      if (v.metodoPago === 'EFECTIVO') {
        ventasEfectivo += t;
      } else if (v.metodoPago === 'TARJETA') {
        ventasTarjeta += t;
      } else if (v.metodoPago === 'TRANSFERENCIA') {
        ventasTransferencia += t;
      } else if (v.metodoPago === 'CREDITO') {
        ventasCredito += t;
      }
    }

    let ingresosEfectivo = 0;
    let egresosEfectivo = 0;

    for (const m of movimientos) {
      const monto = Number(m.monto || 0);
      // Asumir EFECTIVO si no se especifica
      const mp = m.metodoPago || 'EFECTIVO';
      if (mp === 'EFECTIVO') {
        if (m.tipo === 'INGRESO') {
          ingresosEfectivo += monto;
        } else if (m.tipo === 'EGRESO') {
          egresosEfectivo += monto;
        }
      }
    }

    // Efectivo esperado en caja = Monto Inicial + Ventas Efectivo + Ingresos Efectivo - Egresos Efectivo
    const montoEsperado = Math.round((montoInicial + ventasEfectivo + ingresosEfectivo - egresosEfectivo) * 100) / 100;

    return {
      montoInicial,
      ventasEfectivo: Math.round(ventasEfectivo * 100) / 100,
      ventasTarjeta: Math.round(ventasTarjeta * 100) / 100,
      ventasTransferencia: Math.round(ventasTransferencia * 100) / 100,
      ventasCredito: Math.round(ventasCredito * 100) / 100,
      totalVentas: Math.round(totalVentas * 100) / 100,
      ingresosEfectivo: Math.round(ingresosEfectivo * 100) / 100,
      egresosEfectivo: Math.round(egresosEfectivo * 100) / 100,
      montoEsperado,
    };
  }
}
