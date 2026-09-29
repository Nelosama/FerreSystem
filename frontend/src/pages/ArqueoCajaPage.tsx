import React, { useState, useEffect, useCallback } from 'react';
import { TopBar } from '../components/TopBar';
import {
  Calculator,
  CheckCircle,
  Clock,
  Printer,
  X,
  ShieldAlert,
  FileText,
  PlusCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  Lock,
  Unlock,
  AlertTriangle,
} from 'lucide-react';
import { formatLempiras } from '../utils/format';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';

export interface MovimientoRecord {
  id: string;
  tipo: 'INGRESO' | 'EGRESO';
  concepto: string;
  monto: number;
  metodoPago?: string;
  observacion?: string;
  createdAt: string;
  usuario?: { id: string; nombre: string };
}

export interface ResumenCaja {
  montoInicial: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransferencia: number;
  ventasCredito: number;
  totalVentas: number;
  ingresosEfectivo: number;
  egresosEfectivo: number;
  montoEsperado: number;
}

export interface CajaRecord {
  id: string;
  tenantId: string;
  usuarioId: string;
  usuario?: { id: string; nombre: string; email: string };
  usuarioCierre?: { id: string; nombre: string; email: string };
  montoInicial: number;
  montoEsperado: number | null;
  montoContado: number | null;
  diferencia: number | null;
  tipoDiferencia: 'CUADRADO' | 'SOBRANTE' | 'FALTANTE' | string | null;
  estado: 'ABIERTA' | 'CERRADA';
  observaciones?: string;
  fechaApertura: string;
  fechaCierre?: string;
  createdAt: string;
  movimientos?: MovimientoRecord[];
}

export const ArqueoCajaPage: React.FC = () => {
  const { tenant, user } = useTenant();
  const { t } = useI18n();

  // Estados de datos API
  const [cajaActiva, setCajaActiva] = useState<CajaRecord | null>(null);
  const [resumenActivo, setResumenActivo] = useState<ResumenCaja | null>(null);
  const [historialCajas, setHistorialCajas] = useState<CajaRecord[]>([]);

  // Modales y formularios
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // Apertura
  const [montoInicialInput, setMontoInicialInput] = useState('1000.00');
  const [observacionAperturaInput, setObservacionAperturaInput] = useState('');
  const [modalAbrirOpen, setModalAbrirOpen] = useState(false);
  const [submittingAbrir, setSubmittingAbrir] = useState(false);

  // Movimiento
  const [modalMovimientoOpen, setModalMovimientoOpen] = useState(false);
  const [tipoMovimientoInput, setTipoMovimientoInput] = useState<'INGRESO' | 'EGRESO'>('INGRESO');
  const [conceptoMovimientoInput, setConceptoMovimientoInput] = useState('');
  const [montoMovimientoInput, setMontoMovimientoInput] = useState('');
  const [observacionMovimientoInput, setObservacionMovimientoInput] = useState('');
  const [submittingMovimiento, setSubmittingMovimiento] = useState(false);

  // Cierre / Arqueo
  const [montoContadoInput, setMontoContadoInput] = useState('');
  const [notasCierreInput, setNotasCierreInput] = useState('');
  const [submittingCierre, setSubmittingCierre] = useState(false);

  // Modal para ver o imprimir PDF
  const [modalImprimir, setModalImprimir] = useState<{
    caja: CajaRecord;
    resumen?: ResumenCaja;
  } | null>(null);

  // Carga de datos desde Backend API
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resActual, resHistorial] = await Promise.all([
        api.get('/cajas/actual'),
        api.get('/cajas'),
      ]);

      if (resActual.data.activa && resActual.data.caja) {
        setCajaActiva(resActual.data.caja);
        setResumenActivo(resActual.data.resumen);
      } else {
        setCajaActiva(null);
        setResumenActivo(null);
      }

      setHistorialCajas(resHistorial.data || []);
    } catch (err: any) {
      console.error('Error al cargar información de cajas:', err);
      setError(
        err.response?.data?.message || 'Error al conectar con el servidor de cajas',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Manejador: Abrir Caja
  const handleAbrirCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    const monto = parseFloat(montoInicialInput);
    if (isNaN(monto) || monto < 0) {
      setError('Ingrese un monto inicial válido mayor o igual a cero.');
      return;
    }

    setSubmittingAbrir(true);
    setError(null);
    try {
      await api.post('/cajas', {
        montoInicial: monto,
        observaciones: observacionAperturaInput.trim() || undefined,
      });

      setMensajeExito('¡Caja abierta exitosamente!');
      setModalAbrirOpen(false);
      setObservacionAperturaInput('');
      await cargarDatos();
      setTimeout(() => setMensajeExito(null), 4000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al abrir la caja.');
    } finally {
      setSubmittingAbrir(false);
    }
  };

  // Manejador: Registrar Movimiento
  const handleCrearMovimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cajaActiva) return;

    const monto = parseFloat(montoMovimientoInput);
    if (isNaN(monto) || monto <= 0) {
      setError('El monto del movimiento debe ser mayor a cero.');
      return;
    }

    if (!conceptoMovimientoInput.trim()) {
      setError('El concepto es obligatorio.');
      return;
    }

    setSubmittingMovimiento(true);
    setError(null);
    try {
      await api.post(`/cajas/${cajaActiva.id}/movimientos`, {
        tipo: tipoMovimientoInput,
        concepto: conceptoMovimientoInput.trim(),
        monto,
        metodoPago: 'EFECTIVO',
        observacion: observacionMovimientoInput.trim() || undefined,
      });

      setMensajeExito(`¡${tipoMovimientoInput === 'INGRESO' ? 'Ingreso' : 'Egreso'} registrado correctamente!`);
      setModalMovimientoOpen(false);
      setConceptoMovimientoInput('');
      setMontoMovimientoInput('');
      setObservacionMovimientoInput('');
      await cargarDatos();
      setTimeout(() => setMensajeExito(null), 4000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al registrar el movimiento.');
    } finally {
      setSubmittingMovimiento(false);
    }
  };

  // Manejador: Cerrar Caja / Arqueo
  const handleCerrarCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cajaActiva) return;

    const contadoNumber = parseFloat(montoContadoInput);
    if (isNaN(contadoNumber) || contadoNumber < 0) {
      setError('Por favor ingrese una cantidad numérica válida de efectivo contado.');
      return;
    }

    const esperado = resumenActivo?.montoEsperado ?? 0;
    const diff = contadoNumber - esperado;
    const existeDescuadre = Math.abs(diff) > 0.01;

    if (existeDescuadre && !notasCierreInput.trim()) {
      setError('Existe un descuadre en caja. Debe ingresar obligatoriamente una nota de justificación.');
      return;
    }

    setSubmittingCierre(true);
    setError(null);
    try {
      const res = await api.post(`/cajas/${cajaActiva.id}/cierre`, {
        montoContado: contadoNumber,
        observaciones: notasCierreInput.trim() || undefined,
      });

      setMensajeExito('¡Cierre y Arqueo de Caja registrado y guardado exitosamente!');
      setModalImprimir({
        caja: res.data.caja,
        resumen: res.data.resumen,
      });

      setMontoContadoInput('');
      setNotasCierreInput('');
      await cargarDatos();
      setTimeout(() => setMensajeExito(null), 4000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al procesar el cierre de caja.');
    } finally {
      setSubmittingCierre(false);
    }
  };

  // Carga e impresión de detalle para caja histórica
  const handleVerDetalleCaja = async (cajaId: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/cajas/${cajaId}`);
      setModalImprimir({
        caja: res.data.caja,
        resumen: res.data.resumen,
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al consultar el detalle de la caja.');
    } finally {
      setLoading(false);
    }
  };

  // Cálculos de diferencia en tiempo real
  const contadoNumber = parseFloat(montoContadoInput) || 0;
  const totalEsperado = resumenActivo?.montoEsperado ?? 0;
  const diferenciaCalculada = Math.round((contadoNumber - totalEsperado) * 100) / 100;
  const existeDescuadre = montoContadoInput !== '' && Math.abs(diferenciaCalculada) > 0.01;

  return (
    <div style={styles.container}>
      <TopBar title={t('cash_drawer.title')} subtitle={t('cash_drawer.subtitle')} />

      <main style={styles.content}>
        {/* BANNERS DE MENSAJES Y NOTIFICACIONES */}
        {mensajeExito && (
          <div style={styles.successBanner}>
            <CheckCircle size={20} color="#15803D" />
            <span style={{ fontWeight: 700 }}>{mensajeExito}</span>
          </div>
        )}

        {error && (
          <div style={styles.errorBanner}>
            <AlertTriangle size={20} color="#DC2626" />
            <span style={{ fontWeight: 700 }}>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={16} color="#DC2626" />
            </button>
          </div>
        )}

        {/* REFRESH Y ACCIONES RÁPIDAS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className={`badge ${cajaActiva ? 'badge-success' : 'badge-warning'}`}>
              {cajaActiva ? 'CAJA ABIERTA' : 'SIN CAJA ACTIVA'}
            </span>
            {cajaActiva && (
              <span style={{ fontSize: '13px', color: '#57534E', fontWeight: 600 }}>
                Responsable: <strong>{cajaActiva.usuario?.nombre || user?.nombre}</strong> • Apertura:{' '}
                {new Date(cajaActiva.fechaApertura).toLocaleString('es-HN')}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => cargarDatos()}
              disabled={loading}
              title="Actualizar datos desde el servidor"
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              <span>RECARGAR</span>
            </button>

            {!cajaActiva ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setModalAbrirOpen(true)}
              >
                <Unlock size={18} /> ABRIR CAJA FISICA
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalMovimientoOpen(true)}
              >
                <PlusCircle size={18} color="var(--color-primary)" />
                <span>REGISTRAR INGRESO / EGRESO</span>
              </button>
            )}
          </div>
        </div>

        {/* PANEL PRINCIPAL SI NO HAY CAJA ABIERTA */}
        {!cajaActiva && !loading && (
          <div className="industrial-card" style={{ padding: '32px', textAlign: 'center', marginBottom: '28px', backgroundColor: '#FAFAF9' }}>
            <Lock size={48} color="#78716C" style={{ marginBottom: '12px' }} />
            <h2 style={{ fontSize: '18px', textTransform: 'uppercase', marginBottom: '8px' }}>
              NO TIENES UNA CAJA ABIERTA EN ESTE MOMENTO
            </h2>
            <p style={{ color: '#57534E', maxWidth: '540px', margin: '0 auto 20px', fontSize: '14px' }}>
              Para procesar cobros en POS y llevar un control de arqueo de efectivo, debes iniciar un turno abriendo la caja con un monto inicial.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '12px 24px', fontSize: '14px' }}
              onClick={() => setModalAbrirOpen(true)}
            >
              <Unlock size={18} /> INICIAR TURNO Y ABRIR CAJA
            </button>
          </div>
        )}

        {/* GRID SI EXISTE CAJA ABIERTA */}
        {cajaActiva && resumenActivo && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            {/* PANEL IZQUIERDO: RESUMEN DE VENTAS Y MOVIMIENTOS */}
            <div className="industrial-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '2px solid #292524', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Calculator size={22} color="var(--color-primary)" />
                  <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>MONITOREO DE CAJA EN TIEMPO REAL</h2>
                </div>
                <span className="badge badge-dark">SISTEMA EN VIVO</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#FAFAF9', padding: '16px', border: '1.5px solid #D6D3D1', borderRadius: '4px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Fondo Fijo Inicial de Caja:</span>
                  <span style={{ fontWeight: 700 }}>{formatLempiras(resumenActivo.montoInicial)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Ventas en Efectivo del Turno (+):</span>
                  <span style={{ fontWeight: 700, color: '#16A34A' }}>{formatLempiras(resumenActivo.ventasEfectivo)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Ingresos Manuales de Efectivo (+):</span>
                  <span style={{ fontWeight: 700, color: '#16A34A' }}>{formatLempiras(resumenActivo.ingresosEfectivo)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Egresos / Gastos de Caja (-):</span>
                  <span style={{ fontWeight: 700, color: '#DC2626' }}>{formatLempiras(resumenActivo.egresosEfectivo)}</span>
                </div>

                <div style={{ height: '1px', backgroundColor: '#D6D3D1', margin: '4px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#57534E' }}>
                  <span>Ventas con Tarjeta (P.O.S):</span>
                  <span style={{ fontWeight: 600 }}>{formatLempiras(resumenActivo.ventasTarjeta)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#57534E' }}>
                  <span>Ventas por Transferencia:</span>
                  <span style={{ fontWeight: 600 }}>{formatLempiras(resumenActivo.ventasTransferencia)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#57534E' }}>
                  <span>Ventas a Crédito Cliente:</span>
                  <span style={{ fontWeight: 600 }}>{formatLempiras(resumenActivo.ventasCredito)}</span>
                </div>

                <div style={{ height: '1px', backgroundColor: '#D6D3D1', margin: '4px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800 }}>
                  <span>TOTAL RECAUDADO TODAS FORMAS:</span>
                  <span>{formatLempiras(resumenActivo.totalVentas)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 900, color: 'var(--color-primary)', paddingTop: '6px', borderTop: '1px dashed #A8A29E' }}>
                  <span>EFECTIVO ESPERADO EN CAJA:</span>
                  <span>{formatLempiras(resumenActivo.montoEsperado)}</span>
                </div>
              </div>

              {/* MOVIMIENTOS MANUALES RECIENTES */}
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>
                    MOVIMIENTOS MANUALES REGISTRADOS ({cajaActiva.movimientos?.length || 0})
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalMovimientoOpen(true)}
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                  >
                    + NUEVO MOVIMIENTO
                  </button>
                </div>

                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #E7E5E4', borderRadius: '4px' }}>
                  {(!cajaActiva.movimientos || cajaActiva.movimientos.length === 0) ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: '#78716C', fontSize: '12px' }}>
                      Sin movimientos manuales en este turno.
                    </div>
                  ) : (
                    cajaActiva.movimientos.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderBottom: '1px solid #F5F5F4',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {m.tipo === 'INGRESO' ? (
                            <ArrowUpCircle size={16} color="#16A34A" />
                          ) : (
                            <ArrowDownCircle size={16} color="#DC2626" />
                          )}
                          <div>
                            <div style={{ fontWeight: 700 }}>{m.concepto}</div>
                            {m.observacion && (
                              <div style={{ fontSize: '10px', color: '#78716C' }}>{m.observacion}</div>
                            )}
                          </div>
                        </div>
                        <span
                          style={{
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            color: m.tipo === 'INGRESO' ? '#16A34A' : '#DC2626',
                          }}
                        >
                          {m.tipo === 'INGRESO' ? '+' : '-'}{formatLempiras(m.monto)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* PANEL DERECHO: FORMULARIO DE CONTEO Y ARQUEO FINAL */}
            <div className="industrial-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '2px solid #292524', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Lock size={22} color="#DC2626" />
                  <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>CIERRE Y CONTEO FÍSICO DE CAJA</h2>
                </div>
              </div>

              <form onSubmit={handleCerrarCaja}>
                <div className="form-group">
                  <label className="form-label">EFECTIVO FÍSICO CONTADO EN CAJA (L.)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={montoContadoInput}
                    onChange={(e) => setMontoContadoInput(e.target.value)}
                    className="form-input"
                    style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'monospace', padding: '12px' }}
                  />
                </div>

                {/* CUADRO DE VALIDACIÓN DE DESVIACIÓN */}
                {montoContadoInput !== '' && (
                  <div
                    style={{
                      padding: '14px',
                      borderRadius: '4px',
                      marginBottom: '16px',
                      backgroundColor: !existeDescuadre ? '#DCFCE7' : '#FEF2F2',
                      border: !existeDescuadre ? '2px solid #16A34A' : '2px solid #DC2626',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 900, fontSize: '13px', color: !existeDescuadre ? '#15803D' : '#991B1B' }}>
                        {!existeDescuadre
                          ? '✓ ARQUEO CUADRADO EXACTAMENTE'
                          : diferenciaCalculada > 0
                          ? '⚠ SOBRANTE EN CAJA DETECTADO'
                          : '⚠ FALTANTE EN CAJA DETECTADO'}
                      </div>
                      <span style={{ fontWeight: 900, fontFamily: 'monospace', fontSize: '14px' }}>
                        {formatLempiras(diferenciaCalculada)}
                      </span>
                    </div>

                    {existeDescuadre && (
                      <div style={{ fontSize: '11px', color: '#991B1B', marginTop: '6px', lineHeight: '1.4' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                          <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span>
                            <strong>VALIDACIÓN DE AUDITORÍA:</strong> El saldo contado difiere en{' '}
                            <strong>{formatLempiras(Math.abs(diferenciaCalculada))}</strong> del efectivo esperado por el sistema (L. {formatLempiras(totalEsperado)}).
                            Ingresa una justificación obligatoria en las notas.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">
                    NOTAS DE AUDITORÍA {existeDescuadre ? '(OBLIGATORIA POR DESCUADRE)' : '(OPCIONAL)'}
                  </label>
                  <textarea
                    placeholder="Escriba aquí justificaciones de descuadre, billetes rotos o notas del turno..."
                    value={notasCierreInput}
                    onChange={(e) => setNotasCierreInput(e.target.value)}
                    className="form-input"
                    rows={3}
                    required={existeDescuadre}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '13px', marginTop: '8px' }}
                  disabled={submittingCierre}
                >
                  <CheckCircle size={18} /> {submittingCierre ? 'GUARDANDO CIERRE...' : 'CERRAR CAJA Y GENERAR ACTA PDF'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* HISTORIAL DE CAJAS CERRADAS */}
        <div className="industrial-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '2px solid #292524', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Clock size={22} color="#0284C7" />
              <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>HISTORIAL DE ARQUEOS Y CIERRES DE CAJA</h2>
            </div>
            <span style={{ fontSize: '12px', color: '#78716C', fontWeight: 600 }}>
              {historialCajas.length} registros guardados
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="industrial-table" style={{ width: '100%', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th>CAJERO RESPONSABLE</th>
                  <th>FECHA APERTURA</th>
                  <th>FECHA CIERRE</th>
                  <th style={{ textAlign: 'right' }}>MONTO INICIAL</th>
                  <th style={{ textAlign: 'right' }}>EFE. ESPERADO</th>
                  <th style={{ textAlign: 'right' }}>EFE. DECLARADO</th>
                  <th style={{ textAlign: 'right' }}>DIFERENCIA</th>
                  <th style={{ textAlign: 'center' }}>ESTADO</th>
                  <th style={{ textAlign: 'center' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {historialCajas.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: '#78716C', padding: '20px' }}>
                      No se encontraron registros previos de cajas en el sistema.
                    </td>
                  </tr>
                ) : (
                  historialCajas.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 800 }}>{c.usuario?.nombre || 'Cajero'}</td>
                      <td>{new Date(c.fechaApertura).toLocaleString('es-HN')}</td>
                      <td>{c.fechaCierre ? new Date(c.fechaCierre).toLocaleString('es-HN') : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{formatLempiras(c.montoInicial)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {c.montoEsperado !== null ? formatLempiras(c.montoEsperado) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {c.montoContado !== null ? formatLempiras(c.montoContado) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>
                        {c.diferencia !== null ? (
                          <span
                            style={{
                              color:
                                c.diferencia === 0
                                  ? '#15803D'
                                  : c.diferencia > 0
                                  ? '#D97706'
                                  : '#DC2626',
                            }}
                          >
                            {formatLempiras(c.diferencia)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {c.estado === 'ABIERTA' ? (
                          <span className="badge badge-success">ABIERTA</span>
                        ) : c.tipoDiferencia === 'CUADRADO' ? (
                          <span className="badge badge-dark">CUADRADO</span>
                        ) : c.tipoDiferencia === 'SOBRANTE' ? (
                          <span className="badge badge-warning">SOBRANTE</span>
                        ) : (
                          <span className="badge badge-danger">FALTANTE</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleVerDetalleCaja(c.id)}
                          className="btn btn-sm btn-secondary"
                          title="Ver e Imprimir Comprobante PDF"
                          style={{ padding: '4px 8px' }}
                        >
                          <Printer size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL: ABRIR CAJA FISICA */}
      {modalAbrirOpen && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '460px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Unlock size={20} color="var(--color-primary)" />
                <h3 style={{ fontSize: '15px', textTransform: 'uppercase' }}>APERTURA DE CAJA CHICA</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAbrirOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAbrirCaja}>
              <div className="form-group">
                <label className="form-label">MONTO INICIAL EN EFECTIVO (FONDO FIJO)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={montoInicialInput}
                  onChange={(e) => setMontoInicialInput(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'monospace' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">OBSERVACIONES / OBSERVACION DE APERTURA</label>
                <textarea
                  placeholder="Ej: Billetes de baja denominación entregados por administración..."
                  value={observacionAperturaInput}
                  onChange={(e) => setObservacionAperturaInput(e.target.value)}
                  className="form-input"
                  rows={2}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setModalAbrirOpen(false)}
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={submittingAbrir}
                >
                  {submittingAbrir ? 'ABRIENDO...' : 'CONFIRMAR APERTURA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR MOVIMIENTO (INGRESO / EGRESO) */}
      {modalMovimientoOpen && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '480px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PlusCircle size={20} color="var(--color-primary)" />
                <h3 style={{ fontSize: '15px', textTransform: 'uppercase' }}>MOVIMIENTO MANUAL DE CAJA</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalMovimientoOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrearMovimiento}>
              <div className="form-group">
                <label className="form-label">TIPO DE MOVIMIENTO</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setTipoMovimientoInput('INGRESO')}
                    className={`btn ${tipoMovimientoInput === 'INGRESO' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '8px' }}
                  >
                    <ArrowUpCircle size={16} /> INGRESO (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoMovimientoInput('EGRESO')}
                    className={`btn ${tipoMovimientoInput === 'EGRESO' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '8px' }}
                  >
                    <ArrowDownCircle size={16} /> EGRESO (-)
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">CONCEPTO / MOTIVO</label>
                <input
                  type="text"
                  required
                  placeholder={tipoMovimientoInput === 'INGRESO' ? 'Ej: Fondo adicional entregado' : 'Ej: Pago de flete / papelería'}
                  value={conceptoMovimientoInput}
                  onChange={(e) => setConceptoMovimientoInput(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">MONTO (L.)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  placeholder="0.00"
                  value={montoMovimientoInput}
                  onChange={(e) => setMontoMovimientoInput(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">NOTAS ADICIONALES</label>
                <input
                  type="text"
                  placeholder="Opcional..."
                  value={observacionMovimientoInput}
                  onChange={(e) => setObservacionMovimientoInput(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setModalMovimientoOpen(false)}
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={submittingMovimiento}
                >
                  {submittingMovimiento ? 'GUARDANDO...' : 'REGISTRAR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PLANTILLA Y COMPONENTE DE IMPRESIÓN PDF DEL CIERRE DE CAJA */}
      {modalImprimir && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '620px' }}>
            <div style={styles.modalHeader} className="no-print">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '16px 20px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={20} color="var(--color-primary)" />
                  <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>COMPROBANTE OFICIAL DE CIERRE DE CAJA</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setModalImprimir(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* AREA IMPRIMIBLE */}
            <div id="print-cierre-area" style={{ padding: '24px', backgroundColor: '#FFFFFF', color: '#1C1917' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #1C1917', paddingBottom: '12px', marginBottom: '16px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '18px', textTransform: 'uppercase' }}>
                  {tenant.nombreComercial}
                </div>
                <div style={{ fontSize: '11px', color: '#44403C', marginTop: '2px' }}>
                  {tenant.direccion || 'San Pedro Sula, Honduras'} • Tel: {tenant.telefono || '+504 2550-0000'}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 800, marginTop: '2px' }}>
                  ACTA OFICIAL DE AUDITORÍA Y CIERRE DE CAJA
                </div>
              </div>

              {/* DATOS DE SESIÓN */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px', marginBottom: '16px', backgroundColor: '#FAFAF9', padding: '10px', border: '1px solid #D6D3D1' }}>
                <div><strong>CAJERO RESPONSABLE:</strong> {modalImprimir.caja.usuario?.nombre || 'Cajero'}</div>
                <div><strong>FECHA APERTURA:</strong> {new Date(modalImprimir.caja.fechaApertura).toLocaleString('es-HN')}</div>
                <div>
                  <strong>FECHA CIERRE:</strong>{' '}
                  {modalImprimir.caja.fechaCierre
                    ? new Date(modalImprimir.caja.fechaCierre).toLocaleString('es-HN')
                    : 'EN CURSO'}
                </div>
                <div><strong>ESTADO:</strong> {modalImprimir.caja.estado}</div>
                <div>
                  <strong>SUPERVISOR CIERRE:</strong>{' '}
                  {modalImprimir.caja.usuarioCierre?.nombre || user?.nombre || 'Administración'}
                </div>
                <div><strong>RESULTADO ARQUEO:</strong> {modalImprimir.caja.tipoDiferencia || 'CUADRADO'}</div>
              </div>

              {/* DESGLOSE SI HAY RESUMEN */}
              {modalImprimir.resumen && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
                    1. AUDITORÍA DE VENTAS Y RECAUDACIÓN
                  </div>
                  <table className="industrial-table" style={{ width: '100%', fontSize: '11px' }}>
                    <thead>
                      <tr>
                        <th>CONCEPTO</th>
                        <th style={{ textAlign: 'right' }}>MONTO</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Ventas Efectivo</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(modalImprimir.resumen.ventasEfectivo)}</td>
                      </tr>
                      <tr>
                        <td>Ventas Tarjeta P.O.S</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(modalImprimir.resumen.ventasTarjeta)}</td>
                      </tr>
                      <tr>
                        <td>Ventas Transferencia</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(modalImprimir.resumen.ventasTransferencia)}</td>
                      </tr>
                      <tr>
                        <td>Ventas Crédito</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(modalImprimir.resumen.ventasCredito)}</td>
                      </tr>
                      <tr style={{ fontWeight: 900, backgroundColor: '#FAFAF9' }}>
                        <td>TOTAL VENTAS TURNO</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-primary)' }}>{formatLempiras(modalImprimir.resumen.totalVentas)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* AUDITORÍA DE BÓVEDA / EFECTIVO */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  2. BALANCE DE EFECTIVO EN CAJA
                </div>
                <table className="industrial-table" style={{ width: '100%', fontSize: '11px' }}>
                  <tbody>
                    <tr>
                      <td>Fondo Fijo Inicial</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(modalImprimir.caja.montoInicial)}</td>
                    </tr>
                    <tr>
                      <td>EFECTIVO ESPERADO POR SISTEMA</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>
                        {modalImprimir.caja.montoEsperado !== null
                          ? formatLempiras(modalImprimir.caja.montoEsperado)
                          : formatLempiras(modalImprimir.resumen?.montoEsperado ?? 0)}
                      </td>
                    </tr>
                    <tr>
                      <td>EFECTIVO DECLARADO Y CONTADO</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>
                        {modalImprimir.caja.montoContado !== null
                          ? formatLempiras(modalImprimir.caja.montoContado)
                          : '—'}
                      </td>
                    </tr>
                    <tr
                      style={{
                        fontWeight: 900,
                        backgroundColor:
                          (modalImprimir.caja.diferencia ?? 0) === 0 ? '#DCFCE7' : '#FEE2E2',
                      }}
                    >
                      <td>DIFERENCIA FINAL (SOBRANTE / FALTANTE)</td>
                      <td
                        style={{
                          textAlign: 'right',
                          color: (modalImprimir.caja.diferencia ?? 0) === 0 ? '#15803D' : '#991B1B',
                        }}
                      >
                        {modalImprimir.caja.diferencia !== null
                          ? formatLempiras(modalImprimir.caja.diferencia)
                          : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* NOTAS */}
              <div style={{ marginBottom: '24px', fontSize: '11px', padding: '10px', backgroundColor: '#FAFAF9', border: '1px solid #D6D3D1' }}>
                <strong>OBSERVACIONES / JUSTIFICACIÓN DE AUDITORÍA:</strong>
                <div style={{ marginTop: '4px', color: '#44403C' }}>
                  {modalImprimir.caja.observaciones || 'Sin observaciones registradas.'}
                </div>
              </div>

              {/* FIRMAS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px', textAlign: 'center', fontSize: '11px' }}>
                <div>
                  <div style={{ borderTop: '1.5px solid #1C1917', paddingTop: '6px', fontWeight: 800 }}>
                    ________________________________
                  </div>
                  <div>FIRMA CAJERO RESPONSABLE</div>
                </div>

                <div>
                  <div style={{ borderTop: '1.5px solid #1C1917', paddingTop: '6px', fontWeight: 800 }}>
                    ________________________________
                  </div>
                  <div>FIRMA SUPERVISOR / GERENCIA</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', padding: '16px 20px' }} className="no-print">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalImprimir(null)}
              >
                CERRAR
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.print()}
              >
                <Printer size={16} /> IMPRIMIR CIERRE (PDF)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: '100vh',
    backgroundColor: 'var(--color-bg)',
  },
  content: {
    padding: '24px 32px 48px',
    maxWidth: '1400px',
    width: '100%',
  },
  successBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 18px',
    backgroundColor: '#DCFCE7',
    border: '2px solid #15803D',
    borderRadius: 'var(--radius-xs)',
    marginBottom: '20px',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 18px',
    backgroundColor: '#FEE2E2',
    border: '2px solid #DC2626',
    borderRadius: 'var(--radius-xs)',
    marginBottom: '20px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: '20px',
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    borderBottom: '2px solid var(--color-border)',
  },
};
