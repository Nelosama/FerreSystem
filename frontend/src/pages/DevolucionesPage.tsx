import React, { useEffect, useRef, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { api } from '../utils/api';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { SyncStatus } from '../components/SyncStatus';
import { formatInstanteNegocio, formatLempiras } from '../utils/format';
import { numeroVentaDesdeIdentificador } from '../utils/numeroVenta';
import { alertas } from '../utils/alertas';
import './OperacionesPage.css';

const estadosReembolso: Record<string, string> = { PENDIENTE: 'Pendiente', COMPLETADO: 'Completado', SUSTITUIDO: 'Sustituido' };
const metodosReembolso: Record<string, string> = { EFECTIVO: 'Efectivo', TARJETA: 'Reverso de tarjeta en el POS bancario', TRANSFERENCIA: 'Transferencia' };

type Command = { kind: 'SOLICITAR' | 'EJECUTAR' | 'DECIDIR' | 'DIRECTA'; requestId: string; saleId?: string; dto?: any };
// Destino obligatorio por producto (decisión del 2026-11-12). Las etiquetas son las anteriores: la correspondencia de estos
// códigos con «reintegro / garantía / baja-merma» está pendiente de confirmar por el dueño (revisión de #247).
const destinations: Record<string, string> = { INVENTARIO: 'Volver a existencias vendibles', 'DAÑADO': 'Producto dañado (no aumenta existencias)', PROVEEDOR: 'Devolver al proveedor (no aumenta existencias)', NO_ENTREGADO: 'Cancelar productos aún no entregados' };
const statuses: Record<string, string> = { PENDIENTE: 'Esperando al administrador', AUTORIZADA: 'Autorizada: falta confirmar devolución', RECHAZADA: 'Rechazada', EJECUTADA: 'Devolución registrada' };
const errorMessage = (e: any) => {
  const message = e.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message || 'No se pudo confirmar. Revisa la conexión y consulta de nuevo.';
};
function readCommand(key: string): Command | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  // Compatibilidad: una devolución directa pendiente del flujo anterior conserva su identidad.
  if (parsed.saleId && parsed.dto?.solicitudId && !parsed.kind) return { ...parsed, kind: 'DIRECTA', requestId: parsed.dto.solicitudId };
  if (!['SOLICITAR', 'EJECUTAR', 'DECIDIR', 'DIRECTA'].includes(parsed.kind) || typeof parsed.requestId !== 'string') throw new Error('Pendiente inválido');
  if (['SOLICITAR', 'DIRECTA'].includes(parsed.kind) && (!parsed.saleId || parsed.dto?.solicitudId !== parsed.requestId)) throw new Error('Pendiente inválido');
  if (parsed.kind === 'DECIDIR' && !parsed.dto) throw new Error('Pendiente inválido');
  return parsed;
}

export const DevolucionesPage: React.FC = () => {
  const { tenant, user, isReadOnly } = useTenant();
  const key = `ferre_pending_return:${tenant.id}:${user?.id}`;
  const scope = useRef(key); scope.current = key;
  const sending = useRef(false);
  const [numero, setNumero] = useState('');
  const [sale, setSale] = useState<any>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [conditions, setConditions] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState('');
  const [anulacion, setAnulacion] = useState(false);
  const [method, setMethod] = useState('EFECTIVO');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Command | null>(null);
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [corrupt, setCorrupt] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const isAdmin = user?.rol === 'ADMIN';

  useEffect(() => {
    setAnulacion(false); setSale(null); setQuantities({}); setTargets({}); setConditions({}); setResult(null); setNumero(''); setMotivo(''); setMethod('EFECTIVO'); setNotice(''); setError(''); setDecisionNotes({}); setPage(0); setRequests([]); setPending(null); setCorrectionId(null); setCorrupt(false);
    try { setPending(readCommand(key)); } catch { setCorrupt(true); setError('No se puede leer la operación pendiente. Conserva este navegador y pide ayuda al administrador antes de registrar otra devolución.'); }
  }, [key]);

  // Solicitudes: se cargan al entrar, se actualizan solas y tras cada decisión. Cambiar de sucursal o de página cancela la consulta anterior.
  const { refresh: refrescarSolicitudes, sync } = useAutoRefresh<any[]>({
    load: signal => api.get('/operaciones/solicitudes-devolucion', { params: { page }, signal }).then(response => response.data),
    apply: data => setRequests(data),
    intervalMs: 30_000,
    deps: [key, page],
  });
  const loading = requests.length === 0 && (sync.phase === 'idle' || sync.phase === 'loading');
  const listError = requests.length === 0 && sync.phase === 'error' ? 'No se pudieron consultar las solicitudes. Se reintentará automáticamente.' : '';

  const load = async () => {
    if (sending.current || (pending && !correctionId) || corrupt) return;
    const startedKey = key; sending.current = true; setBusy(true); setError(''); setSale(null);
    try {
      const response = await api.get('/operaciones/ventas/buscar', { params: { numero: numeroVentaDesdeIdentificador(numero) } });
      if (scope.current !== startedKey) return;
      setAnulacion(false); setSale(response.data); setQuantities({}); setTargets({}); setConditions({});
    } catch (e) { if (scope.current === startedKey) setError(errorMessage(e)); }
    finally { sending.current = false; setBusy(false); }
  };

  const run = async (command: Command) => {
    if (scope.current !== key || sending.current || isReadOnly || corrupt) return;
    const startedKey = key; sending.current = true; setBusy(true); setError(''); setNotice('');
    const current = () => scope.current === startedKey;
    const releaseCommand = () => {
      const stored = readCommand(startedKey);
      if (stored && JSON.stringify(stored) === JSON.stringify(command)) localStorage.removeItem(startedKey);
      // Otra pestaña puede haber conservado un comando distinto mientras esperábamos.
      setPending(stored && JSON.stringify(stored) !== JSON.stringify(command) ? stored : null);
      setCorrectionId(null);
    };
    let posted = false;
    try {
      // No se envía nada si no se puede conservar la identidad antes de la petición.
      const stored = readCommand(startedKey);
      if (stored && JSON.stringify(stored) !== JSON.stringify(command) && !(correctionId === stored.requestId && command.requestId === stored.requestId && command.kind === 'SOLICITAR' && stored.kind === 'SOLICITAR')) throw new Error('Existe otra operación pendiente. Confírmala primero.');
      localStorage.setItem(startedKey, JSON.stringify(command)); setPending(command);
      let response: any;
      let recoveredOriginal = false;
      if (command.kind === 'DIRECTA') {
        try { response = (await api.get(`/operaciones/devoluciones/${command.requestId}`)).data; }
        catch (e: any) {
          if (e.response?.status !== 404) throw e;
          if (!current()) return;
          response = (await api.post(`/operaciones/ventas/${command.saleId}/devoluciones`, command.dto)).data;
        }
      } else if (command.kind === 'SOLICITAR') {
        // Consultar primero permite recuperar una respuesta perdida sin generar otra solicitud.
        try {
          const found = await api.get(`/operaciones/solicitudes-devolucion/${command.requestId}`);
          response = found.data;
          const dto = response.comando;
          if (!dto || dto.solicitudId !== command.requestId) throw new Error('No se pudo reconocer la solicitud confirmada. Pide ayuda al administrador.');
          recoveredOriginal = response.venta_id !== command.saleId || dto.motivo !== command.dto.motivo || dto.metodo !== command.dto.metodo || JSON.stringify(dto.items.map((i: any) => [i.detalleId, i.cantidad, i.destino])) !== JSON.stringify(command.dto.items.map((i: any) => [i.detalleId, i.cantidad, i.destino]));
        } catch (e: any) {
          if (e.response?.status !== 404) throw e;
          if (!current()) return;
          response = (await api.post(`/operaciones/ventas/${command.saleId}/solicitudes-devolucion`, command.dto)).data;
        }
      } else if (command.kind === 'EJECUTAR') {
        const found = (await api.get(`/operaciones/solicitudes-devolucion/${command.requestId}`)).data;
        if (!current()) return;
        if (found.resultado) response = found.resultado;
        else {
          if (found.estado !== 'AUTORIZADA') throw new Error('La solicitud aún no está autorizada o fue rechazada.');
          posted = true;
          response = (await api.post(`/operaciones/solicitudes-devolucion/${command.requestId}/ejecutar`, {})).data;
        }
      } else {
        if (!current()) return;
        posted = true;
        response = (await api.post(`/operaciones/solicitudes-devolucion/${command.requestId}/decision`, command.dto)).data;
      }
      if (!current()) return;
      if (command.kind === 'EJECUTAR' || command.kind === 'DIRECTA') {
        // Conservar hasta cerrar el comprobante: al volver se consulta el resultado confirmado.
        setResult(response);
      } else {
        releaseCommand();
        setNotice(recoveredOriginal ? 'Se recuperó la solicitud original que ya estaba registrada. Tus correcciones no la modificaron; revisa sus datos en la lista antes de continuar.' : command.kind === 'SOLICITAR' ? 'Solicitud guardada. El administrador debe revisarla; todavía no se movió dinero ni inventario.' : `Decisión guardada: ${statuses[response.estado]}.`);
      }
      setSale(null); setMotivo(''); setQuantities({}); void refrescarSolicitudes();
    } catch (e: any) {
      if (!current()) return;
      setError(e.message && !e.response && e.message !== 'Network Error' ? e.message : errorMessage(e));
      if (posted && ['DECIDIR', 'EJECUTAR'].includes(command.kind) && [400, 403, 404, 409, 422].includes(e.response?.status)) {
        try {
          // Un rechazo del reintento no descarta una confirmación anterior. Consultar
          // la misma identidad antes de liberar el comando conserva esa recuperación.
          const found = (await api.get(`/operaciones/solicitudes-devolucion/${command.requestId}`)).data;
          if (!current()) return;
          if (found.id !== command.requestId || !statuses[found.estado]) throw new Error('Estado de solicitud inválido');
          if (command.kind === 'EJECUTAR' && (found.estado === 'EJECUTADA' && !found.resultado || found.resultado && found.resultado.id !== command.requestId)) throw new Error('Comprobante de solicitud inválido');
          if (command.kind === 'EJECUTAR' && found.resultado) {
            setResult(found.resultado);
            setError('');
            setNotice('Se recuperó la devolución ya registrada con la misma solicitud.');
          } else {
            releaseCommand();
            setNotice(command.kind === 'DECIDIR'
              ? found.estado === 'PENDIENTE' ? 'Este intento de decisión fue rechazado. Revisa la solicitud y el motivo antes de decidir de nuevo.' : `Se recuperó el estado confirmado: ${statuses[found.estado]}.`
              : 'Este intento de ejecución fue rechazado. La solicitud sigue guardada en la lista con la misma identidad; revisa el motivo antes de volver a confirmarla.');
          }
          void refrescarSolicitudes();
        } catch {
          if (current()) setNotice('No pudimos comprobar el estado después del rechazo. Conservamos la operación y su identidad; consulta de nuevo cuando puedas acceder a la solicitud.');
        }
      }
    } finally { sending.current = false; setBusy(false); }
  };

  const clearUnregistered = async () => {
    if (!pending || pending.kind !== 'SOLICITAR' || sending.current || isReadOnly) return;
    const startedKey = key; sending.current = true; setBusy(true); setError('');
    try {
      await api.get(`/operaciones/solicitudes-devolucion/${pending.requestId}`);
      if (scope.current === startedKey) setError('La solicitud ya está registrada. Confírmala para recuperarla.');
    } catch (e: any) {
      if (scope.current !== startedKey) return;
      if (e.response?.status !== 404) { setError(errorMessage(e)); return; }
      setCorrectionId(pending.requestId); setSale(null); setMotivo(pending.dto?.motivo || ''); setMethod(pending.dto?.metodo || 'EFECTIVO');
      setNotice('La consulta no encontró la solicitud. Busca la venta y corrige los datos; conservaremos la misma identidad y consultaremos otra vez antes de enviar.');
    } finally { sending.current = false; setBusy(false); }
  };

  const blocked = busy || (!!pending && !correctionId) || corrupt || isReadOnly;
  return <div><TopBar title="Devoluciones y anulaciones" subtitle="Solicitar → revisar → autorizar → confirmar devolución" />
    <main className="operation-page">
      <section className="operation-card"><h2>{isAdmin ? 'Revisar devoluciones' : 'Solicitar una devolución'}</h2>
        <p>{isAdmin ? 'Revisa la venta, los productos, las cantidades y el motivo antes de decidir. Autorizar no realiza el reembolso: el solicitante debe confirmarlo desde su caja.' : 'Busca el número del comprobante, selecciona los productos e indica el motivo. Después de la autorización, confirma la devolución para registrar el reembolso.'}</p>
      </section>
      {error && <p role="alert" className="operation-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {result && <section className="operation-card" role="status"><h2>Devolución registrada</h2>
        <p>Importe: {formatLempiras(Number(result.monto))} · Crédito cancelado: {formatLempiras(Number(result.credito_cancelado))} · Reembolso: {formatLempiras(Number(result.reembolso))} ({result.metodo})</p>
        {result.reembolso_estado === 'PENDIENTE' && <p>El reembolso quedó pendiente: registra la referencia en «Reembolsos» cuando el banco confirme el reverso o la transferencia.</p>}
        <p>Documento {result.id}</p><button className="btn btn-secondary" disabled={busy} onClick={() => {
          try {
            const stored = readCommand(key);
            const ownsReceipt = stored && ['EJECUTAR', 'DIRECTA'].includes(stored.kind) && stored.requestId === result.id;
            if (ownsReceipt) localStorage.removeItem(key);
            setPending(ownsReceipt ? null : stored);
            setCorrectionId(value => !ownsReceipt && stored?.requestId === value ? value : null);
            setResult(null);
          } catch { setError('No se pudo cerrar el comprobante. Conservamos la operación para consultarla al volver.'); }
        }}>Cerrar comprobante</button>
      </section>}
      {pending && !result && <section className="operation-error"><p>Hay una operación pendiente de confirmar. Consultaremos su estado y usaremos la misma identidad para evitar duplicados.</p>
        <button disabled={busy || isReadOnly} className="btn btn-primary" onClick={() => void run(pending)}>Consultar y confirmar pendiente</button>
        {pending.kind === 'SOLICITAR' && <button disabled={busy || isReadOnly} className="btn btn-secondary" onClick={() => void clearUnregistered()}>Corregir solo si no está registrada</button>}
      </section>}
      <form className="operation-card operation-form" onSubmit={e => { e.preventDefault(); void load(); }}>
        <label>Número del comprobante de venta<input className="form-input" type="text" inputMode="numeric" autoComplete="off" placeholder="Ej. 3 o V-3" required disabled={busy || (!!pending && !correctionId) || corrupt} value={numero} onChange={e => setNumero(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy || (!!pending && !correctionId) || corrupt}>Buscar venta</button>
      </form>
      {sale && <form className="operation-card" onSubmit={e => {
        e.preventDefault(); if (blocked) return;
        // Condición del producto y motivo son opcionales: solo se envían si se escriben.
        const items = sale.items.map((item: any) => ({ detalleId: item.id, cantidad: Number(quantities[item.id] || 0), destino: targets[item.id] || (item.sin_inventario ? 'PROVEEDOR' : sale.reserva_pendiente ? 'NO_ENTREGADO' : 'INVENTARIO'), ...(conditions[item.id]?.trim() ? { condicion: conditions[item.id].trim() } : {}) })).filter((item: any) => item.cantidad > 0);
        if (!items.length) { setError('Selecciona al menos un producto y la cantidad a devolver.'); return; }
        const requestId = correctionId || crypto.randomUUID();
        void run({ kind: 'SOLICITAR', requestId, saleId: sale.id, dto: { solicitudId: requestId, ...(motivo.trim() ? { motivo: motivo.trim() } : {}), metodo: method, items, ...(anulacion ? { anulacion: true } : {}) } });
      }}>
        <h2>Venta {sale.numero_venta} · {sale.cliente_nombre || 'Consumidor final'}</h2>
        <p>{sale.metodo_pago} · Total {formatLempiras(Number(sale.total))} · {sale.reserva_pendiente ? 'Productos pendientes de entregar' : 'Productos entregados o documento histórico'}</p>
        <button type="button" className="btn btn-secondary" disabled={blocked || sale.devoluciones.length > 0} onClick={() => {
          setAnulacion(value => !value);
          setQuantities(anulacion ? {} : Object.fromEntries(sale.items.map((item: any) => [item.id, String(Number(item.cantidad))])));
        }}>{anulacion ? 'Volver a devolución parcial' : 'Solicitar anulación de toda la venta'}</button>
        {anulacion && <p role="status">Anulación total: requiere el motivo y la autorización de otro administrador desde su propia sesión. El documento original se conserva y se genera una devolución compensatoria. Revise el destino físico de cada producto.</p>}
        <fieldset disabled={blocked}><legend>Productos que se devolverán</legend>
          <div className="operation-table"><table><thead><tr><th>Producto</th><th>Disponible para devolver</th><th>Cantidad a devolver</th><th>Qué pasará con el producto</th><th>Condición (opcional)</th></tr></thead><tbody>
            {sale.items.map((item: any) => {
              const rest = Number(item.cantidad) - Number(item.devuelto);
              const choices = item.sin_inventario ? ['PROVEEDOR', 'DAÑADO'] : sale.reserva_pendiente ? ['NO_ENTREGADO'] : ['INVENTARIO', 'DAÑADO', 'PROVEEDOR'];
              return <tr key={item.id}><td>{item.codigo} · {item.nombre}</td><td>{rest} (ya devuelto: {Number(item.devuelto)})</td>
                <td><input aria-label={`Devolver ${item.nombre}`} type="number" step=".01" min="0" max={rest} disabled={rest <= 0 || anulacion} value={quantities[item.id] || '0'} onChange={e => setQuantities({ ...quantities, [item.id]: e.target.value })} /></td>
                <td><select aria-label={`Destino de ${item.nombre}`} value={targets[item.id] || choices[0]} onChange={e => setTargets({ ...targets, [item.id]: e.target.value })}>{choices.map(value => <option key={value} value={value}>{destinations[value]}</option>)}</select></td>
                <td><input aria-label={`Condición de ${item.nombre}`} className="form-input" maxLength={200} placeholder="Ej. caja abierta, sin uso" value={conditions[item.id] || ''} onChange={e => setConditions({ ...conditions, [item.id]: e.target.value })} /></td></tr>;
            })}
          </tbody></table></div>
          <div className="operation-form"><label>{anulacion ? 'Motivo de la anulación' : 'Motivo de la devolución (opcional)'}<input className="form-input" required={anulacion} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
            <label>Método del reembolso<select className="form-input" value={method} onChange={e => setMethod(e.target.value)}>{['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].map(value => <option key={value}>{value}</option>)}</select></label></div>
          <p>Se reduce primero el crédito pendiente; el excedente se registra como reembolso desde tu caja abierta. Solo los productos que vuelven a existencias vendibles aumentan el inventario. En efectivo, el reembolso sale de la caja al confirmar. Con tarjeta queda pendiente hasta registrar la referencia del reverso en el POS bancario; con transferencia, hasta registrar su referencia. El sistema no mueve dinero en el banco.</p>
          <button className="btn btn-primary">Enviar solicitud de autorización</button>
        </fieldset>
        <h3>Devoluciones anteriores</h3>{sale.devoluciones.length ? sale.devoluciones.map((item: any) => <p key={item.id}>{formatInstanteNegocio(item.created_at)} · {item.motivo || 'Sin motivo indicado'} · {formatLempiras(Number(item.monto))}</p>) : <p>No hay devoluciones registradas para esta venta.</p>}
      </form>}
      <ReembolsosSection isAdmin={isAdmin} readOnly={isReadOnly} refreshKey={key} />
      <section className="operation-card"><h2>{isAdmin ? 'Solicitudes para revisar' : 'Mis solicitudes'}</h2>
        <SyncStatus sync={sync} />
        {loading && <p role="status">Consultando solicitudes…</p>}
        {listError && <p role="alert">{listError}</p>}
        {!loading && !listError && !requests.length && <p>No hay solicitudes en esta página.</p>}
        {!loading && !listError && requests.map(request => <article className="operation-card" key={request.id}>
          <h3>{request.comando.anulacion ? 'Anulación' : 'Venta'} {request.numero_venta} · {statuses[request.estado] || request.estado}</h3>
          <p>Solicita: {request.solicitante_nombre} · {formatInstanteNegocio(request.created_at)}</p>
          <p>Motivo: {request.comando.motivo || 'Sin motivo indicado'} · Método propuesto: {request.comando.metodo}</p>
          <p>Importe estimado a devolver: {formatLempiras(Number(request.monto_estimado))}. El crédito pendiente y el reembolso se calculan al confirmar.</p>
          <p>Total de la venta original: {formatLempiras(Number(request.total_venta))} · Pago original: {request.metodo_pago}</p>
          <ul>{request.items?.map((item: any, index: number) => <li key={index}>{item.codigo} · {item.nombre}: {item.cantidad} · {destinations[item.destino]}</li>)}</ul>
          {request.administrador_nombre && <p>Decidió: {request.administrador_nombre}{request.motivo_decision ? ` · ${request.motivo_decision}` : ''}</p>}
          {isAdmin && request.solicitante_id !== user?.id && request.estado === 'PENDIENTE' && <form className="operation-form" onSubmit={e => {
            e.preventDefault(); if (blocked) return;
            void run({ kind: 'DECIDIR', requestId: request.id, dto: { decision: 'AUTORIZADA', ...(decisionNotes[request.id]?.trim() ? { motivo: decisionNotes[request.id].trim() } : {}) } });
          }}><label>Motivo de la decisión (opcional)<input className="form-input" maxLength={500} disabled={blocked} value={decisionNotes[request.id] || ''} onChange={e => setDecisionNotes({ ...decisionNotes, [request.id]: e.target.value })} /></label>
            <button className="btn btn-primary" disabled={blocked}>Autorizar estos productos y cantidades</button>
            <button type="button" className="btn btn-secondary" disabled={blocked} onClick={() => {
              void run({ kind: 'DECIDIR', requestId: request.id, dto: { decision: 'RECHAZADA', ...(decisionNotes[request.id]?.trim() ? { motivo: decisionNotes[request.id].trim() } : {}) } });
            }}>Rechazar solicitud</button></form>}
          {isAdmin && request.solicitante_id === user?.id && request.estado === 'PENDIENTE' && <p>Otro administrador debe revisar esta solicitud.</p>}
          {request.estado === 'AUTORIZADA' && request.solicitante_id === user?.id && <button className="btn btn-primary" disabled={blocked} onClick={() => void run({ kind: 'EJECUTAR', requestId: request.id })}>Confirmar devolución y reembolso</button>}
          {request.estado === 'EJECUTADA' && <button className="btn btn-secondary" disabled={busy || (!!pending && !correctionId) || corrupt} onClick={async () => {
            const startedKey = key;
            try { const response = await api.get(`/operaciones/solicitudes-devolucion/${request.id}`); if (scope.current === startedKey) setResult(response.data.resultado); }
            catch (e) { if (scope.current === startedKey) setError(errorMessage(e)); }
          }}>Ver comprobante</button>}
        </article>)}
        <div className="operation-form"><button className="btn btn-secondary" disabled={page === 0 || loading || busy} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page + 1}</span><button className="btn btn-secondary" disabled={requests.length < 50 || loading || busy} onClick={() => setPage(value => value + 1)}>Siguiente</button></div>
      </section>
    </main>
  </div>;
};

/**
 * Reembolsos con estado (decisión del 2026-11-12). El servidor decide qué ve y qué puede hacer cada usuario; aquí solo se
 * ofrecen las acciones. Registrar un reembolso no significa que el banco ya movió el dinero.
 */
const ReembolsosSection: React.FC<{ isAdmin: boolean; readOnly: boolean; refreshKey: string }> = ({ isAdmin, readOnly, refreshKey }) => {
  const [lista, setLista] = useState<any[] | null>(null);
  const [fallo, setFallo] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [referencias, setReferencias] = useState<Record<string, string>>({});
  const [evidencias, setEvidencias] = useState<Record<string, string>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const { refresh: cargar, sync } = useAutoRefresh<any[]>({
    load: signal => api.get('/operaciones/reembolsos', { signal }).then(response => response.data?.reembolsos ?? []),
    apply: data => setLista(data),
    intervalMs: 30_000,
    deps: [refreshKey],
  });
  const falloLista = lista === null && sync.phase === 'error' ? 'No se pudieron consultar los reembolsos. Se reintentará automáticamente.' : '';
  const accion = async (peticion: () => Promise<unknown>, exito: string) => {
    if (ocupado || readOnly) return;
    setOcupado(true); setFallo(''); setAviso('');
    try { await peticion(); setAviso(exito); }
    catch (e) { setFallo(errorMessage(e)); }
    finally { await cargar(); setOcupado(false); }
  };
  const completar = (r: any) => {
    const referencia = referencias[r.id]?.trim();
    if (!referencia) { setFallo('Registra la referencia del reverso o de la transferencia.'); return; }
    void accion(() => api.post(`/operaciones/reembolsos/${r.id}/completar`, { referencia, ...(evidencias[r.id]?.trim() ? { evidencia: evidencias[r.id].trim() } : {}) }), 'Reembolso registrado como completado.');
  };
  const sinReverso = async (r: any, decision: 'ESPERAR' | 'EFECTIVO' | 'TRANSFERENCIA') => {
    if (decision !== 'ESPERAR' && !(await alertas.confirmar({
      texto: decision === 'EFECTIVO' ? `Se entregarán ${formatLempiras(Number(r.monto))} en efectivo desde tu caja y el reverso de tarjeta quedará sustituido. ¿Continuar?` : 'El reverso de tarjeta quedará sustituido por una transferencia pendiente de su referencia. ¿Continuar?',
    }))) return;
    void accion(() => api.post(`/operaciones/reembolsos/${r.id}/sin-reverso`, { decision, ...(motivos[r.id]?.trim() ? { motivo: motivos[r.id].trim() } : {}) }),
      decision === 'ESPERAR' ? 'Intento registrado: el reverso sigue pendiente.' : decision === 'EFECTIVO' ? 'Reembolso entregado en efectivo.' : 'Reembolso por transferencia pendiente de su referencia.');
  };
  const pendientes = (lista ?? []).filter(r => r.estado === 'PENDIENTE');
  return <section className="operation-card" aria-labelledby="titulo-reembolsos"><h2 id="titulo-reembolsos">Reembolsos</h2>
    <p>Con tarjeta, intenta el reverso en el POS bancario y registra su referencia aquí. {isAdmin ? 'Si no se puede revertir, decide si esperar o reembolsar en efectivo o por transferencia.' : 'Si no se puede revertir, el administrador decide cómo reembolsar.'}</p>
    {(fallo || falloLista) && <p role="alert" className="operation-error">{fallo || falloLista}</p>}
    {aviso && <p role="status">{aviso}</p>}
    {lista === null && !falloLista && <p role="status">Consultando reembolsos…</p>}
    {lista !== null && !pendientes.length && <p>No hay reembolsos pendientes.</p>}
    {pendientes.map(r => <article className="operation-card" key={r.id} data-testid={`reembolso-${r.id}`}>
      <h3>Venta {r.numero_venta} · {formatLempiras(Number(r.monto))} · {metodosReembolso[r.metodo] || r.metodo} · {estadosReembolso[r.estado] || r.estado}</h3>
      <p>Registró: {r.registrado_por_nombre} · {formatInstanteNegocio(r.registrado_at)}{r.intentos_fallidos > 0 ? ` · Intentos sin reverso: ${r.intentos_fallidos}` : ''}</p>
      {r.nota && <p>Nota: {r.nota}</p>}
      <div className="operation-form">
        <label>Referencia bancaria<input className="form-input" maxLength={100} disabled={ocupado || readOnly} value={referencias[r.id] || ''} onChange={e => setReferencias({ ...referencias, [r.id]: e.target.value })} /></label>
        <label>Evidencia (opcional)<input className="form-input" maxLength={500} placeholder="Ej. número de comprobante o descripción" disabled={ocupado || readOnly} value={evidencias[r.id] || ''} onChange={e => setEvidencias({ ...evidencias, [r.id]: e.target.value })} /></label>
        <button type="button" className="btn btn-primary" disabled={ocupado || readOnly} onClick={() => completar(r)}>{r.metodo === 'TARJETA' ? 'Registrar reverso realizado' : 'Registrar transferencia realizada'}</button>
      </div>
      {isAdmin && r.metodo === 'TARJETA' && <div className="operation-form">
        <label>Motivo (opcional)<input className="form-input" maxLength={500} disabled={ocupado || readOnly} value={motivos[r.id] || ''} onChange={e => setMotivos({ ...motivos, [r.id]: e.target.value })} /></label>
        <button type="button" className="btn btn-secondary" disabled={ocupado || readOnly} onClick={() => void sinReverso(r, 'ESPERAR')}>No se pudo revertir: esperar</button>
        <button type="button" className="btn btn-secondary" disabled={ocupado || readOnly} onClick={() => void sinReverso(r, 'EFECTIVO')}>Reembolsar en efectivo</button>
        <button type="button" className="btn btn-secondary" disabled={ocupado || readOnly} onClick={() => void sinReverso(r, 'TRANSFERENCIA')}>Reembolsar por transferencia</button>
      </div>}
    </article>)}
  </section>;
};
