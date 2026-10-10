import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { formatearCentavos } from '../offline/money';
import './PosContingenciaPage.css';

// Panel del administrador (móvil). Muestra lo que recibió el servidor: si la caja no reporta, lo indica.
// Las acciones exigen una nota y quedan auditadas en el servidor.

interface Conflicto { codigo: string; detalle?: Record<string, unknown> }
interface Operacion {
  operacionId: string; estado: string; requiereRevision: boolean; conflictos: Conflicto[];
  correlativoLocal: string; correlativoDefinitivo: string | null; numeroVenta: number | null;
  cajero: string | null; dispositivo: string; totalCentavos: number; efectivoRecibidoCentavos: number; cambioCentavos: number;
  ocurridoAt: string; recibidoAt: string; referenciaFacturaExterna: string | null; cajaId?: string;
}
interface Resumen {
  fecha: string; generadoAt: string; aviso: string | null;
  ventasDelDia: { origen: string; cantidad: number; total: number }[];
  contingencia: Record<string, { cantidad: number; totalCentavos: number } | number>;
  dispositivos: { codigo: string; nombre: string; desactualizado: boolean; ultimoContactoAt: string | null; pendientesReportados: number }[];
}

const ETIQUETAS: Record<string, string> = {
  PRECIO_NO_AUTORIZADO: 'Precio distinto al autorizado',
  STOCK_INSUFICIENTE: 'Stock insuficiente en la nube',
  CAJA_CERRADA: 'La caja ya cerró',
  USUARIO_NO_AUTORIZADO: 'Cajero desactivado o sin permiso',
  VENTANA_EXPIRADA: 'Venta después de vencer la ventana',
  VENTANA_REVOCADA: 'Venta después de revocar el equipo',
  RELOJ_ANOMALO: 'Hora del equipo no coincide',
  LIMITE_VENTA_EXCEDIDO: 'Supera el límite por venta',
  LIMITE_ACUMULADO_EXCEDIDO: 'Supera el límite acumulado',
  CUPO_EXCEDIDO: 'Supera el cupo del producto',
  PRODUCTO_INACTIVO: 'Producto inactivo',
  PRODUCTO_FUERA_DE_VENTANA: 'Producto fuera del catálogo autorizado',
  PRODUCTO_NO_ENCONTRADO: 'Producto no encontrado',
  TOTAL_DIFERENTE: 'El total del equipo no cuadra con el servidor',
  EFECTIVO_INCONSISTENTE: 'Efectivo − cambio no es igual al total',
  SECUENCIA_DUPLICADA: 'Número local repetido',
  OPERACION_ALTERADA: 'Mismo identificador con otro contenido',
  RECHAZADA_TECNICA: 'El servidor no aceptó la operación',
};
const etiqueta = (c: Conflicto) => ETIQUETAS[c.codigo] ?? c.codigo;

export default function ContingenciaAdminPage() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [ops, setOps] = useState<Operacion[]>([]);
  const [soloRevision, setSoloRevision] = useState(true);
  const [habilitada, setHabilitada] = useState<boolean | null>(null);
  const [entornoHabilitado, setEntornoHabilitado] = useState<boolean | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [referencias, setReferencias] = useState<Record<string, string>>({});
  const [cajasAbiertas, setCajasAbiertas] = useState<{ id: string; codigo: string; usuario: string }[]>([]);
  const [caja, setCaja] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [r, o, c] = await Promise.all([
        api.get('/contingencia/resumen'),
        api.get('/contingencia/operaciones', { params: { soloRevision: soloRevision ? 'true' : undefined, limit: 100 } }),
        api.get('/contingencia/configuracion'),
      ]);
      setResumen(r.data);
      setOps(o.data);
      setHabilitada(Boolean(c.data.habilitada));
      setEntornoHabilitado(Boolean(c.data.entornoHabilitado));
      const abiertas = await api.get('/operaciones/caja/cierres', { params: { estado: 'ABIERTA' } }).then((x) => x.data).catch(() => []);
      setCajasAbiertas((abiertas ?? []).map((k: any) => ({ id: k.id, codigo: k.codigo, usuario: k.usuario?.nombre ?? '' })));
      setMensaje(null);
    } catch (error: any) {
      setMensaje({ tipo: 'error', texto: error?.response?.data?.message ?? 'No se pudo cargar el panel. Revise la conexión.' });
    } finally {
      setCargando(false);
    }
  }, [soloRevision]);

  useEffect(() => { void cargar(); }, [cargar]);

  const resolver = async (op: Operacion, accion: 'ACEPTAR' | 'CERRAR_MANUAL' | 'MARCAR_REVISADA' | 'REINTENTAR') => {
    const nota = (notas[op.operacionId] ?? '').trim();
    if (nota.length < 10) { setMensaje({ tipo: 'error', texto: 'Escriba una nota de al menos 10 caracteres explicando la decisión.' }); return; }
    try {
      await api.post(`/contingencia/operaciones/${op.operacionId}/resolver`, {
        accion, nota, cajaId: caja[op.operacionId] || undefined,
      });
      setNotas((n) => ({ ...n, [op.operacionId]: '' }));
      setMensaje({ tipo: 'ok', texto: 'Decisión registrada y auditada.' });
      await cargar();
    } catch (error: any) {
      setMensaje({ tipo: 'error', texto: error?.response?.data?.message ?? 'No se pudo registrar la decisión.' });
    }
  };

  const guardarReferencia = async (op: Operacion) => {
    try {
      await api.patch(`/contingencia/operaciones/${op.operacionId}/referencia-factura`, { referenciaFacturaExterna: referencias[op.operacionId] ?? '' });
      setMensaje({ tipo: 'ok', texto: 'Referencia guardada. No es una numeración fiscal.' });
      await cargar();
    } catch (error: any) {
      setMensaje({ tipo: 'error', texto: error?.response?.data?.message ?? 'No se pudo guardar la referencia.' });
    }
  };

  const cambiarActivacion = async (valor: boolean) => {
    try {
      await api.patch('/contingencia/configuracion', { habilitada: valor });
      setMensaje({ tipo: 'ok', texto: valor ? 'Contingencia activada para esta empresa.' : 'Contingencia desactivada.' });
      await cargar();
    } catch (error: any) {
      setMensaje({ tipo: 'error', texto: error?.response?.data?.message ?? 'No se pudo cambiar la configuración.' });
    }
  };

  const c = resumen?.contingencia;
  const cifra = (clave: string) => {
    const v = c?.[clave];
    return typeof v === 'object' && v ? v.cantidad : 0;
  };
  const importe = (clave: string) => {
    const v = c?.[clave];
    return typeof v === 'object' && v ? formatearCentavos(v.totalCentavos) : formatearCentavos(0);
  };

  return (
    <div className="pc-root" style={{ padding: 0 }}>
      <header className="pc-header">
        <h1>Contingencia offline · administración</h1>
        <button className="pc-btn" onClick={() => void cargar()} disabled={cargando}>{cargando ? 'Actualizando…' : 'Actualizar'}</button>
      </header>

      {resumen?.aviso && <div className="pc-aviso error" role="alert">{resumen.aviso} Lo que se muestra puede estar desactualizado.</div>}
      {mensaje && <div className={`pc-aviso ${mensaje.tipo === 'ok' ? 'ok' : 'error'}`} role="status">{mensaje.texto}</div>}

      <section className="pc-panel" style={{ margin: 16 }} aria-label="Activación">
        <h2>Activación</h2>
        <p>
          Entorno: {entornoHabilitado === null ? '…' : entornoHabilitado ? 'permitido' : 'desactivado por el servidor'} ·
          Empresa: {habilitada === null ? '…' : habilitada ? 'activada' : 'desactivada'}
        </p>
        <p style={{ fontSize: 14 }}>
          Antes de activar debe existir la aprobación fiscal documentada (ver docs/POS_OFFLINE_CONTINGENCIA_DISENO.md, §4).
          La contingencia no emite numeración fiscal.
        </p>
        <button className="pc-btn" onClick={() => void cambiarActivacion(!habilitada)} disabled={habilitada === null || (!habilitada && !entornoHabilitado)}>
          {habilitada ? 'Desactivar contingencia' : 'Activar contingencia'}
        </button>
      </section>

      <section className="pc-panel" style={{ margin: 16 }} aria-label="Resumen del día">
        <h2>Resumen de hoy ({resumen?.fecha ?? '…'})</h2>
        <div className="pc-grid" style={{ padding: 0, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          <div className="pc-panel"><strong>Sincronizadas</strong><div>{cifra('sincronizadas')} · {importe('sincronizadas')}</div></div>
          <div className="pc-panel"><strong>Sincronizadas con observación</strong><div>{cifra('sincronizadasConRevision')}</div></div>
          <div className="pc-panel"><strong>Con conflicto</strong><div>{cifra('conflictos')} · {importe('conflictos')}</div></div>
          <div className="pc-panel"><strong>Resueltas a mano</strong><div>{cifra('resueltasManual')}</div></div>
          <div className="pc-panel"><strong>Pendientes reportados por cajas</strong><div>{typeof c?.pendientesReportadosPorCajas === 'number' ? c.pendientesReportadosPorCajas : 0}</div></div>
        </div>
        <h3 style={{ fontSize: 15, marginTop: 14 }}>Cajas de contingencia</h3>
        {resumen?.dispositivos.length ? (
          <ul className="pc-pendientes">
            {resumen.dispositivos.map((d) => (
              <li key={d.codigo}>
                {d.nombre} ({d.codigo}) · último contacto: {d.ultimoContactoAt ? new Date(d.ultimoContactoAt).toLocaleString('es-HN') : 'nunca'}
                {d.desactualizado && <strong style={{ color: '#b45309' }}> · sin reporte reciente: información posiblemente desactualizada</strong>}
              </li>
            ))}
          </ul>
        ) : <p>Ninguna caja registrada todavía.</p>}
      </section>

      <section className="pc-panel" style={{ margin: 16 }} aria-label="Operaciones">
        <h2>Operaciones</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className={`pc-btn ${soloRevision ? 'primario' : ''}`} style={soloRevision ? { fontSize: 15, minHeight: 40, width: 'auto' } : undefined} onClick={() => setSoloRevision(true)}>Requieren revisión</button>
          <button className={`pc-btn ${!soloRevision ? 'primario' : ''}`} style={!soloRevision ? { fontSize: 15, minHeight: 40, width: 'auto' } : undefined} onClick={() => setSoloRevision(false)}>Todas</button>
        </div>
        {ops.length === 0 && <p>No hay operaciones en esta vista.</p>}
        <div style={{ display: 'grid', gap: 12 }}>
          {ops.map((op) => (
            <article key={op.operacionId} className="pc-panel" aria-label={`Operación ${op.correlativoLocal}`}>
              <strong>{op.correlativoLocal}</strong>
              {op.correlativoDefinitivo && <> · Central {op.correlativoDefinitivo}</>}
              <div style={{ fontSize: 14 }}>
                Cajero: {op.cajero ?? '—'} · Caja de contingencia: {op.dispositivo} · Estado: {op.estado}
                <br />Total {formatearCentavos(op.totalCentavos)} · Recibido {formatearCentavos(op.efectivoRecibidoCentavos)} · Cambio {formatearCentavos(op.cambioCentavos)}
                <br />Ocurrió {new Date(op.ocurridoAt).toLocaleString('es-HN')} · Recibida {new Date(op.recibidoAt).toLocaleString('es-HN')}
              </div>
              {op.conflictos.length > 0 && (
                <ul style={{ fontSize: 14, color: '#7c2d12' }}>
                  {op.conflictos.map((k, i) => <li key={`${k.codigo}-${i}`}>{etiqueta(k)}</li>)}
                </ul>
              )}
              {op.estado === 'REVISION' && op.conflictos.some((k) => k.codigo === 'CAJA_CERRADA') && (
                <label style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                  Caja abierta donde se registrará el efectivo
                  <select value={caja[op.operacionId] ?? ''} onChange={(e) => setCaja((x) => ({ ...x, [op.operacionId]: e.target.value }))}>
                    <option value="">Seleccione una caja abierta</option>
                    {cajasAbiertas.map((k) => <option key={k.id} value={k.id}>{k.codigo} · {k.usuario}</option>)}
                  </select>
                </label>
              )}
              {(op.estado === 'REVISION' || (op.estado === 'SINCRONIZADA' && op.requiereRevision)) && (
                <label style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                  Nota de la decisión (mínimo 10 caracteres)
                  <textarea rows={2} value={notas[op.operacionId] ?? ''} onChange={(e) => setNotas((n) => ({ ...n, [op.operacionId]: e.target.value }))} />
                </label>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {op.estado === 'REVISION' && (
                  <>
                    <button className="pc-btn primario" style={{ fontSize: 15, minHeight: 44, width: 'auto' }} onClick={() => void resolver(op, 'ACEPTAR')}>Aceptar y aplicar</button>
                    <button className="pc-btn" onClick={() => void resolver(op, 'CERRAR_MANUAL')}>Cerrar sin aplicar</button>
                  </>
                )}
                {op.estado === 'SINCRONIZADA' && op.requiereRevision && (
                  <button className="pc-btn" onClick={() => void resolver(op, 'MARCAR_REVISADA')}>Marcar como revisada</button>
                )}
              </div>
              <label style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                Referencia de factura externa (opcional, no es numeración fiscal)
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={referencias[op.operacionId] ?? op.referenciaFacturaExterna ?? ''} onChange={(e) => setReferencias((r) => ({ ...r, [op.operacionId]: e.target.value }))} maxLength={100} style={{ flex: 1 }} />
                  <button className="pc-btn" onClick={() => void guardarReferencia(op)}>Guardar</button>
                </div>
              </label>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
