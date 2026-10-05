import React,{useEffect,useRef,useState} from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { api } from '../utils/api';
import { readStoredJson } from '../utils/storage';
import { formatLempiras } from '../utils/format';
import './OperacionesPage.css';
export const DevolucionesPage:React.FC=()=>{
 const {tenant,user,isReadOnly}=useTenant();const key=`ferre_pending_return:${tenant.id}:${user?.id}`;
 const [numero,setNumero]=useState(''),[sale,setSale]=useState<any>(null),[quantities,setQuantities]=useState<Record<string,string>>({}),[destinations,setDestinations]=useState<Record<string,string>>({});
 const [motivo,setMotivo]=useState(''),[method,setMethod]=useState('EFECTIVO'),[error,setError]=useState(''),[result,setResult]=useState<any>(null),[busy,setBusy]=useState(false);
 const [pending,setPending]=useState<any>(()=>readStoredJson(key,null));const sending=useRef(false);
 useEffect(()=>{setPending(readStoredJson(key,null));setSale(null);setQuantities({});setResult(null);},[key]);
 const showError=(e:any)=>{const m=e.response?.data?.message;setError(Array.isArray(m)?m.join(', '):m||'No se pudo confirmar. Revise la conexión y reintente.');};
 const load=async()=>{if(busy||pending)return;setBusy(true);setError('');setResult(null);try{setSale((await api.get('/operaciones/ventas/buscar',{params:{numero}})).data);setQuantities({});setDestinations({});}catch(e){setSale(null);showError(e);}finally{setBusy(false);}};
 const send=async(command:any)=>{
  if(sending.current||isReadOnly)return;sending.current=true;setBusy(true);setError('');
  try{localStorage.setItem(key,JSON.stringify(command));setPending(command);const response=await api.post(`/operaciones/ventas/${command.saleId}/devoluciones`,command.dto);setResult(response.data);localStorage.removeItem(key);setPending(null);setSale(null);setMotivo('');setQuantities({});}
  catch(e:any){if([400,403,404,409,422].includes(e.response?.status)){localStorage.removeItem(key);setPending(null);}showError(e);}finally{sending.current=false;setBusy(false);}
 };
 return <div><TopBar title="DEVOLUCIONES" subtitle="Documento original, destino de mercancía y reembolso"/><main className="operation-page">
  {error&&<p role="alert" className="operation-error">{error}</p>}
  {result&&<section className="operation-card"><strong>Devolución registrada</strong><p>Importe: {formatLempiras(Number(result.monto))} · Crédito cancelado: {formatLempiras(Number(result.credito_cancelado))} · Reembolso: {formatLempiras(Number(result.reembolso))} · {result.metodo}</p><p>Documento {result.id}</p></section>}
  {pending&&<section className="operation-error"><p>Hay una devolución pendiente de confirmar. Reintente la misma operación.</p><button disabled={busy||isReadOnly} className="btn btn-primary" onClick={()=>void send(pending)}>Confirmar devolución pendiente</button></section>}
  <form className="operation-card operation-form" onSubmit={e=>{e.preventDefault();void load();}}><label>Número de venta<input className="form-input" type="number" min="1" required disabled={busy||!!pending} value={numero} onChange={e=>setNumero(e.target.value)}/></label><button className="btn btn-primary" disabled={busy||!!pending}>Consultar venta</button></form>
  {sale&&<form className="operation-card" onSubmit={e=>{e.preventDefault();const items=sale.items.map((i:any)=>({detalleId:i.id,cantidad:Number(quantities[i.id]||0),destino:destinations[i.id]||(i.sin_inventario?'PROVEEDOR':sale.reserva_pendiente?'NO_ENTREGADO':'INVENTARIO')})).filter((i:any)=>i.cantidad>0);if(!items.length){setError('Seleccione cantidades para devolver');return;}void send({saleId:sale.id,dto:{solicitudId:crypto.randomUUID(),motivo,metodo:method,items}});}}>
   <h2>Venta {sale.numero_venta} · {sale.cliente_nombre||'Consumidor final'}</h2><p>{sale.metodo_pago} · Total {formatLempiras(Number(sale.total))} · {sale.reserva_pendiente?'Mercancía pendiente de entrega':'Mercancía entregada o documento histórico'}</p>
   <fieldset disabled={busy||!!pending||isReadOnly}><div className="operation-table"><table><thead><tr><th>Producto</th><th>Vendido / devuelto</th><th>Devolver</th><th>Destino</th></tr></thead><tbody>{sale.items.map((i:any)=>{const rest=Number(i.cantidad)-Number(i.devuelto);const choices=i.sin_inventario?['PROVEEDOR','DAÑADO']:sale.reserva_pendiente?['NO_ENTREGADO']:['INVENTARIO','DAÑADO','PROVEEDOR'];return <tr key={i.id}><td>{i.codigo} · {i.nombre}</td><td>{Number(i.cantidad)} / {Number(i.devuelto)}</td><td><input aria-label={`Devolver ${i.nombre}`} type="number" step=".01" min="0" max={rest} value={quantities[i.id]||'0'} onChange={e=>setQuantities({...quantities,[i.id]:e.target.value})}/></td><td><select value={destinations[i.id]||choices[0]} onChange={e=>setDestinations({...destinations,[i.id]:e.target.value})}>{choices.map(d=><option key={d}>{d}</option>)}</select></td></tr>;})}</tbody></table></div>
   <div className="operation-form"><label>Motivo<input className="form-input" required maxLength={500} value={motivo} onChange={e=>setMotivo(e.target.value)}/></label><label>Método del reembolso<select className="form-input" value={method} onChange={e=>setMethod(e.target.value)}>{['EFECTIVO','TARJETA','TRANSFERENCIA'].map(m=><option key={m}>{m}</option>)}</select></label></div>
   <p>La devolución reduce primero el crédito pendiente; el excedente se reembolsa desde una caja abierta. Solo INVENTARIO devuelve mercancía entregada a las existencias vendibles. DAÑADO y PROVEEDOR conservan trazabilidad sin aumentar existencias.</p><button className="btn btn-primary">Registrar devolución</button></fieldset>
   <h3>Devoluciones anteriores</h3>{sale.devoluciones.map((d:any)=><p key={d.id}>{new Date(d.created_at).toLocaleString('es-HN')} · {d.motivo} · {formatLempiras(Number(d.monto))}</p>)}
  </form>}
 </main></div>;
};
