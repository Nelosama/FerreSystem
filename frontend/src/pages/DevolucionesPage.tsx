import React, { useEffect, useRef, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { api } from '../utils/api';
import { formatLempiras } from '../utils/format';
import './OperacionesPage.css';

type Command = { kind: 'SOLICITAR' | 'EJECUTAR' | 'DECIDIR' | 'DIRECTA'; requestId: string; saleId?: string; dto?: any };
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
  const [motivo, setMotivo] = useState('');
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
  const [refresh, setRefresh] = useState(0);
  const [listError, setListError] = useState('');
  const [loading, setLoading] = useState(true);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const isAdmin = user?.rol === 'ADMIN';

  useEffect(() => {
    setSale(null); setQuantities({}); setTargets({}); setResult(null); setNumero(''); setMotivo(''); setMethod('EFECTIVO'); setNotice(''); setError(''); setDecisionNotes({}); setPage(0); setRequests([]); setPending(null); setCorrectionId(null); setCorrupt(false);
    try { setPending(readCommand(key)); } catch { setCorrupt(true); setError('No se puede leer la operación pendiente. Conserva este navegador y pide ayuda al administrador antes de registrar otra devolución.'); }
  }, [key]);

  useEffect(() => {
    let active = true;
    const startedKey = key;
    setLoading(true); setListError('');
    api.get('/operaciones/solicitudes-devolucion', { params: { page } }).then(response => {
      if (active && scope.current === startedKey) setRequests(response.data);
    }).catch(e => { if (active && scope.current === startedKey) setListError(errorMessage(e)); })
      .finally(() => { if (active && scope.current === startedKey) setLoading(false); });
    return () => { active = false; };
  }, [key, page, refresh]);

  const load = async () => {
    if (sending.current || (pending && !correctionId) || corrupt) return;
    const startedKey = key; sending.current = true; setBusy(true); setError(''); setSale(null);
    try {
      const response = await api.get('/operaciones/ventas/buscar', { params: { numero } });
      if (scope.current !== startedKey) return;
      setSale(response.data); setQuantities({}); setTargets({});
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
      setSale(null); setMotivo(''); setQuantities({}); setRefresh(value => value + 1);
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
          setRefresh(value => value + 1);
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
  return <div><TopBar title="Devoluciones y autorizaciones" subtitle="Solicitar → revisar → autorizar → confirmar devolución" />
    <main className="operation-page">
      <section className="operation-card"><h2>{isAdmin ? 'Revisar devoluciones' : 'Solicitar una devolución'}</h2>
        <p>{isAdmin ? 'Revisa la venta, los productos, las cantidades y el motivo antes de decidir. Autorizar no realiza el reembolso: el solicitante debe confirmarlo desde su caja.' : 'Busca el número del comprobante, selecciona los productos e indica el motivo. Después de la autorización, confirma la devolución para registrar el reembolso.'}</p>
      </section>
      {error && <p role="alert" className="operation-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {result && <section className="operation-card" role="status"><h2>Devolución registrada</h2>
        <p>Importe: {formatLempiras(Number(result.monto))} · Crédito cancelado: {formatLempiras(Number(result.credito_cancelado))} · Reembolso: {formatLempiras(Number(result.reembolso))} ({result.metodo})</p>
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
        <label>Número del comprobante de venta<input className="form-input" type="number" min="1" step="1" required disabled={busy || (!!pending && !correctionId) || corrupt} value={numero} onChange={e => setNumero(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy || (!!pending && !correctionId) || corrupt}>Buscar venta</button>
      </form>
      {sale && <form className="operation-card" onSubmit={e => {
        e.preventDefault(); if (blocked) return;
        const items = sale.items.map((item: any) => ({ detalleId: item.id, cantidad: Number(quantities[item.id] || 0), destino: targets[item.id] || (item.sin_inventario ? 'PROVEEDOR' : sale.reserva_pendiente ? 'NO_ENTREGADO' : 'INVENTARIO') })).filter((item: any) => item.cantidad > 0);
        if (!items.length) { setError('Selecciona al menos un producto y la cantidad a devolver.'); return; }
        const requestId = correctionId || crypto.randomUUID();
        void run({ kind: 'SOLICITAR', requestId, saleId: sale.id, dto: { solicitudId: requestId, motivo, metodo: method, items } });
      }}>
        <h2>Venta {sale.numero_venta} · {sale.cliente_nombre || 'Consumidor final'}</h2>
        <p>{sale.metodo_pago} · Total {formatLempiras(Number(sale.total))} · {sale.reserva_pendiente ? 'Productos pendientes de entregar' : 'Productos entregados o documento histórico'}</p>
        <fieldset disabled={blocked}><legend>Productos que se devolverán</legend>
          <div className="operation-table"><table><thead><tr><th>Producto</th><th>Disponible para devolver</th><th>Cantidad a devolver</th><th>Qué pasará con el producto</th></tr></thead><tbody>
            {sale.items.map((item: any) => {
              const rest = Number(item.cantidad) - Number(item.devuelto);
              const choices = item.sin_inventario ? ['PROVEEDOR', 'DAÑADO'] : sale.reserva_pendiente ? ['NO_ENTREGADO'] : ['INVENTARIO', 'DAÑADO', 'PROVEEDOR'];
              return <tr key={item.id}><td>{item.codigo} · {item.nombre}</td><td>{rest} (ya devuelto: {Number(item.devuelto)})</td>
                <td><input aria-label={`Devolver ${item.nombre}`} type="number" step=".01" min="0" max={rest} disabled={rest <= 0} value={quantities[item.id] || '0'} onChange={e => setQuantities({ ...quantities, [item.id]: e.target.value })} /></td>
                <td><select aria-label={`Destino de ${item.nombre}`} value={targets[item.id] || choices[0]} onChange={e => setTargets({ ...targets, [item.id]: e.target.value })}>{choices.map(value => <option key={value} value={value}>{destinations[value]}</option>)}</select></td></tr>;
            })}
          </tbody></table></div>
          <div className="operation-form"><label>Motivo de la devolución<input className="form-input" required maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
            <label>Método del reembolso<select className="form-input" value={method} onChange={e => setMethod(e.target.value)}>{['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].map(value => <option key={value}>{value}</option>)}</select></label></div>
          <p>Se reduce primero el crédito pendiente; el excedente se registra como reembolso desde tu caja abierta. Solo los productos que vuelven a existencias vendibles aumentan el inventario. El reembolso con tarjeta o transferencia se registra aquí; el sistema no lo procesa en el banco.</p>
          <button className="btn btn-primary">Enviar solicitud de autorización</button>
        </fieldset>
        <h3>Devoluciones anteriores</h3>{sale.devoluciones.length ? sale.devoluciones.map((item: any) => <p key={item.id}>{new Date(item.created_at).toLocaleString('es-HN')} · {item.motivo} · {formatLempiras(Number(item.monto))}</p>) : <p>No hay devoluciones registradas para esta venta.</p>}
      </form>}
      <section className="operation-card"><h2>{isAdmin ? 'Solicitudes para revisar' : 'Mis solicitudes'}</h2>
        <button className="btn btn-secondary" disabled={loading || busy} onClick={() => setRefresh(value => value + 1)}>Actualizar estados</button>
        {loading && <p role="status">Consultando solicitudes…</p>}
        {listError && <p role="alert">{listError}</p>}
        {!loading && !listError && !requests.length && <p>No hay solicitudes en esta página.</p>}
        {!loading && !listError && requests.map(request => <article className="operation-card" key={request.id}>
          <h3>Venta {request.numero_venta} · {statuses[request.estado] || request.estado}</h3>
          <p>Solicita: {request.solicitante_nombre} · {new Date(request.created_at).toLocaleString('es-HN')}</p>
          <p>Motivo: {request.comando.motivo} · Método propuesto: {request.comando.metodo}</p>
          <p>Importe estimado a devolver: {formatLempiras(Number(request.monto_estimado))}. El crédito pendiente y el reembolso se calculan al confirmar.</p>
          <p>Total de la venta original: {formatLempiras(Number(request.total_venta))} · Pago original: {request.metodo_pago}</p>
          <ul>{request.items?.map((item: any, index: number) => <li key={index}>{item.codigo} · {item.nombre}: {item.cantidad} · {destinations[item.destino]}</li>)}</ul>
          {request.administrador_nombre && <p>Decidió: {request.administrador_nombre} · {request.motivo_decision}</p>}
          {isAdmin && request.estado === 'PENDIENTE' && <form className="operation-form" onSubmit={e => {
            e.preventDefault(); if (blocked) return;
            void run({ kind: 'DECIDIR', requestId: request.id, dto: { decision: 'AUTORIZADA', motivo: decisionNotes[request.id] || '' } });
          }}><label>Motivo de la decisión<input className="form-input" required maxLength={500} disabled={blocked} value={decisionNotes[request.id] || ''} onChange={e => setDecisionNotes({ ...decisionNotes, [request.id]: e.target.value })} /></label>
            <button className="btn btn-primary" disabled={blocked}>Autorizar estos productos y cantidades</button>
            <button type="button" className="btn btn-secondary" disabled={blocked} onClick={() => {
              if (!decisionNotes[request.id]?.trim()) { setError('Indica el motivo de la decisión.'); return; }
              void run({ kind: 'DECIDIR', requestId: request.id, dto: { decision: 'RECHAZADA', motivo: decisionNotes[request.id] } });
            }}>Rechazar solicitud</button></form>}
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
