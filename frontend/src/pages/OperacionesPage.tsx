import React, { useCallback, useEffect, useRef, useState } from 'react';
import { validarLineaCompra, costoSugerido } from '../utils/compraCosto';
import { api } from '../utils/api';
import { useTenant } from '../context/TenantContext';
import { TopBar } from '../components/TopBar';
import { formatLempiras, formatFechaCalendario } from '../utils/format';
import { availableTasks } from '../utils/taskNavigation';
import { useI18n } from '../context/I18nContext';
import { Link } from 'react-router-dom';
import './OperacionesPage.css';

type Mode = 'compras' | 'caja' | 'cuentas' | 'entregas';
const errorMessage = (e: any) => { const m=e.response?.data?.message; return Array.isArray(m)?m.join(', '):m || 'No se pudo confirmar la operación. Revise la conexión y reintente.'; };
const amount = (v:any) => formatLempiras(Number(v || 0));
const fecha = (v:any) => v ? new Date(v).toLocaleString('es-HN') : '—';

export const OperacionesPage: React.FC<{modo:Mode}> = ({modo}) => {
 const {tenant,user,isReadOnly}=useTenant();
 const {t}=useI18n();
 const [rows,setRows]=useState<any[]>([]),[products,setProducts]=useState<any[]>([]),[providers,setProviders]=useState<any[]>([]);
 const [tipo,setTipo]=useState<'CXC'|'CXP'>('CXC');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const [busy,setBusy]=useState(false);const running=useRef(false);
 const pendingKey=`ferre_operacion_pendiente:${tenant.id}:${user?.id}:${modo}`;
 const [pending,setPending]=useState<any>(null);
 const [proveedorId,setProveedorId]=useState(''),[factura,setFactura]=useState(''),[vencimiento,setVencimiento]=useState(''),[tax,setTax]=useState('0');
 const [items,setItems]=useState<any[]>([]),[productId,setProductId]=useState(''),[qty,setQty]=useState('1'),[cost,setCost]=useState('');
 const [providerName,setProviderName]=useState(''),[phone,setPhone]=useState('');
 const [receipts,setReceipts]=useState<Record<string,string>>({});
 const [cashAmount,setCashAmount]=useState(''),[cashNotes,setCashNotes]=useState('');
 const [selected,setSelected]=useState<any>(null),[payAmount,setPayAmount]=useState(''),[method,setMethod]=useState('EFECTIVO');
 useEffect(()=>{try{setPending(JSON.parse(localStorage.getItem(pendingKey)||'null'));}catch{setPending(null);}setSelected(null);},[pendingKey]);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   if(modo==='compras'){
    const [o,p,s]=await Promise.all([api.get('/operaciones/compras'),api.get('/productos'),api.get('/operaciones/proveedores')]);
    setRows(o.data);setProducts(p.data);setProviders(s.data);
   }else if(modo==='caja')setRows((await api.get('/operaciones/caja')).data);
   else if(modo==='cuentas')setRows((await api.get('/operaciones/cuentas',{params:{tipo}})).data);
   else setRows((await api.get('/operaciones/entregas')).data);
  }catch(e){setError(errorMessage(e));}finally{setLoading(false);}
 },[modo,tipo,tenant.id]);
 useEffect(()=>{void load();},[load]);
 const send=async(command:any)=>{
  if(running.current||isReadOnly)return false;
  running.current=true;setBusy(true);setError('');setSuccess('');
  try{
   localStorage.setItem(pendingKey,JSON.stringify(command));setPending(command);
   await api.post(command.path,command.body);
   localStorage.removeItem(pendingKey);setPending(null);setSuccess('Operación registrada.');
   await load();return true;
  }catch(e:any){
   if([400,403,404,409,422].includes(e.response?.status)){localStorage.removeItem(pendingKey);setPending(null);}
   setError(errorMessage(e));return false;
  }finally{setBusy(false);running.current=false;}
 };
 const run=(path:string,body:any)=>pending?send(pending):send({path,body:{...body,solicitudId:crypto.randomUUID()}});
 const blocked=busy||!!pending||isReadOnly;
 const open=rows.find(c=>c.estado==='ABIERTA');
 const total=items.reduce((sum,i)=>sum+Math.round(Number(i.cantidad)*Number(i.costo)*100)/100,0)+Number(tax||0);
 const addItem=()=>{
  const p=products.find(p=>p.id===productId);
  if(!p){setError('Seleccione el producto de la compra.');return;}
  const checked=validarLineaCompra(qty,cost);
  if('error' in checked){setError(checked.error);return;}
  setError('');
  if(items.some(i=>i.productoId===p.id)){setError('El producto ya está en la factura. Quite su línea para corregirla.');return;}
  setItems([...items,{productoId:p.id,nombre:p.nombre,cantidad:checked.linea.cantidad,costo:checked.linea.costo}]);setProductId('');setQty('1');setCost('');
 };
 return <div><TopBar title={{compras:'COMPRAS Y REPOSICIONES',caja:'CAJA Y CIERRE',cuentas:'CUENTAS Y ABONOS',entregas:'ENTREGA DE VENTAS'}[modo]} subtitle="Control operativo de la ferretería"/>
  <main className="operation-page">
   <nav className="operation-actions" aria-label={t('navigation.OPERACION')}>{availableTasks(user, tenant).filter(item => ['pos', 'arqueo_caja', 'cuentas', 'entregas', 'ordenes_compra'].includes(item.key)).map(item => <Link key={item.key} to={item.route}>{t(item.labelKey)}</Link>)}</nav>
   {error&&<div role="alert" className="operation-error">{error}</div>}{success&&<div role="status" className="operation-success">{success}</div>}
   {pending&&<div role="status" className="operation-card"><p>Hay una operación pendiente de confirmar. Reintente antes de registrar otra.</p><button className="btn btn-primary" disabled={busy||isReadOnly} onClick={()=>void send(pending)}>Confirmar operación pendiente</button></div>}
   <button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>void load()}>Actualizar</button>
   {modo==='compras'&&<>
    {user?.rol==='ADMIN'&&<form className="operation-card operation-form" onSubmit={async e=>{e.preventDefault();if(await run('/operaciones/proveedores',{nombre:providerName,telefono:phone})){setProviderName('');setPhone('');}}}>
     <h2>Registrar proveedor</h2><label>Nombre<input className="form-input" required value={providerName} disabled={blocked} onChange={e=>setProviderName(e.target.value)}/></label><label>Teléfono<input className="form-input" value={phone} disabled={blocked} onChange={e=>setPhone(e.target.value)}/></label><button className="btn btn-primary" disabled={blocked}>Guardar proveedor</button>
    </form>}
    <form className="operation-card" onSubmit={async e=>{e.preventDefault();if(await run('/operaciones/compras',{proveedorId,numeroFactura:factura,vencimiento:vencimiento||undefined,isv:Number(tax),items:items.map(({nombre,...i})=>i)})){setItems([]);setFactura('');setTax('0');}}}>
     <h2>Registrar factura de compra</h2><p>Registrar la factura crea el saldo del proveedor. Recibir la mercancía aumenta existencias y actualiza el costo vigente.</p>
     <fieldset disabled={blocked} className="operation-form"><label>Proveedor<select required className="form-input" value={proveedorId} onChange={e=>setProveedorId(e.target.value)}><option value="">Seleccione</option>{providers.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label><label>Número de factura<input className="form-input" required value={factura} onChange={e=>setFactura(e.target.value)}/></label><label>Vencimiento<input className="form-input" type="date" value={vencimiento} onChange={e=>setVencimiento(e.target.value)}/></label><label>Impuesto de la factura<input className="form-input" type="number" min="0" step="0.01" required value={tax} onChange={e=>setTax(e.target.value)}/></label></fieldset>
     <fieldset disabled={blocked} className="operation-form"><label>Producto<select className="form-input" value={productId} onChange={e=>{setProductId(e.target.value);setCost(costoSugerido(products.find(p=>p.id===e.target.value)?.precioCosto));}}><option value="">Seleccione</option>{products.map(p=><option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}</select></label><label>Cantidad<input className="form-input" type="number" min="0.01" step="0.01" value={qty} onChange={e=>setQty(e.target.value)}/></label><label>Costo de esta compra<input className="form-input" type="number" min="0" step="0.01" value={cost} onChange={e=>setCost(e.target.value)}/></label><button type="button" className="btn btn-secondary" onClick={addItem}>Agregar producto</button></fieldset>
     {items.map(i=><p key={i.productoId}>{i.nombre} · {i.cantidad} × {amount(i.costo)} <button disabled={blocked} type="button" onClick={()=>setItems(items.filter(x=>x.productoId!==i.productoId))}>Quitar</button></p>)}<p><strong>Total: {amount(total)}</strong></p><button className="btn btn-primary" disabled={blocked||!items.length}>Registrar factura</button>
    </form>
    {!loading&&rows.map(o=><section className="operation-card" key={o.id}><h3>{o.numero_factura||o.codigo} · {o.proveedor_nombre}</h3><p>{o.estado} · {amount(o.total)} · {fecha(o.created_at)}</p><div className="operation-table"><table><thead><tr><th>Producto</th><th>Pedido</th><th>Recibido</th><th>Costo</th><th>Recibir ahora</th></tr></thead><tbody>{o.items.map((i:any)=>{const rest=Number(i.cantidad)-Number(i.cantidad_recibida);return <tr key={i.id}><td>{i.codigo} · {i.nombre}</td><td>{Number(i.cantidad)}</td><td>{Number(i.cantidad_recibida)}</td><td>{amount(i.precio_costo)}</td><td><input aria-label={`Recibir ${i.nombre}`} type="number" min="0" max={rest} step="0.01" value={receipts[i.id]??String(rest)} disabled={blocked||rest===0} onChange={e=>setReceipts({...receipts,[i.id]:e.target.value})}/></td></tr>;})}</tbody></table></div>{['SOLICITADA','APROBADA'].includes(o.estado)&&<button className="btn btn-primary" disabled={blocked} onClick={()=>void run(`/operaciones/compras/${o.id}/recepciones`,{items:o.items.map((i:any)=>({detalleId:i.id,cantidad:Number(receipts[i.id]??Number(i.cantidad)-Number(i.cantidad_recibida))})).filter((i:any)=>i.cantidad>0)})}>Confirmar recepción</button>}</section>)}
   </>}
   {modo==='caja'&&<>
    {!loading&&!open&&<form className="operation-card operation-form" onSubmit={async e=>{e.preventDefault();if(await run('/operaciones/caja/abrir',{monto:Number(cashAmount)}))setCashAmount('');}}><h2>Abrir mi caja</h2><label>Fondo de apertura<input className="form-input" required min="0" step="0.01" type="number" value={cashAmount} disabled={blocked} onChange={e=>setCashAmount(e.target.value)}/></label><button className="btn btn-primary" disabled={blocked}>Abrir caja</button></form>}
    {open&&<section className="operation-card"><h2>Caja abierta · {fecha(open.fecha_apertura)}</h2><p>Apertura: {amount(open.monto_apertura)} · Efectivo esperado: <strong>{amount(open.efectivoEsperado)}</strong></p><div className="operation-actions">{Object.entries(open.totales).map(([m,v])=><span key={m}>{m}: {amount(v)}</span>)}</div><form className="operation-form" onSubmit={async e=>{e.preventDefault();if(!window.confirm('¿Cerrar el turno con el efectivo contado?'))return;if(await run(`/operaciones/caja/${open.id}/cerrar`,{monto:Number(cashAmount),notas:cashNotes})){setCashAmount('');setCashNotes('');}}}><label>Efectivo contado<input className="form-input" required type="number" min="0" step="0.01" value={cashAmount} disabled={blocked} onChange={e=>setCashAmount(e.target.value)}/></label><label>Observaciones<input className="form-input" value={cashNotes} disabled={blocked} onChange={e=>setCashNotes(e.target.value)}/></label><button className="btn btn-primary" disabled={blocked}>Cerrar turno</button></form><div className="operation-table"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th>Monto</th></tr></thead><tbody>{open.movimientos.map((m:any)=><tr key={m.id}><td>{fecha(m.created_at)}</td><td>{m.concepto}</td><td>{m.metodo}</td><td>{amount(m.monto)}</td></tr>)}</tbody></table></div></section>}
    <h2>Mis cierres</h2>{rows.filter(c=>c.estado==='CERRADA').map(c=><section className="operation-card" key={c.id}><p>{fecha(c.fecha_cierre)} · Esperado {amount(c.monto_esperado)} · Contado {amount(c.monto_cierre_fisico)} · Diferencia <strong>{amount(c.diferencia)}</strong></p>{c.notas&&<p>{c.notas}</p>}</section>)}
   </>}
   {modo==='cuentas'&&<>
    {user?.rol==='ADMIN'&&<div className="operation-actions"><button disabled={blocked} className="btn btn-secondary" onClick={()=>{setTipo('CXC');setSelected(null);}}>Clientes · Por cobrar</button><button disabled={blocked} className="btn btn-secondary" onClick={()=>{setTipo('CXP');setSelected(null);}}>Proveedores · Por pagar</button></div>}
    <h2>{tipo==='CXC'?'Cuentas por cobrar':'Cuentas por pagar'} · Saldo {amount(rows.reduce((sum,c)=>sum+Number(c.saldo),0))}</h2>
    {selected&&<form className="operation-card operation-form" onSubmit={async e=>{e.preventDefault();if(await run(`/operaciones/cuentas/${selected.id}/pagos`,{monto:Number(payAmount),metodo:method})){setSelected(null);setPayAmount('');}}}><h3>Registrar {tipo==='CXC'?'abono':'pago'} · {selected.nombre}</h3><label>Monto<input className="form-input" required min="0.01" max={Number(selected.saldo)} step="0.01" type="number" value={payAmount} disabled={blocked} onChange={e=>setPayAmount(e.target.value)}/></label><label>Método<select className="form-input" value={method} disabled={blocked} onChange={e=>setMethod(e.target.value)}>{['EFECTIVO','TARJETA','TRANSFERENCIA'].map(m=><option key={m}>{m}</option>)}</select></label><button className="btn btn-primary" disabled={blocked}>Registrar</button><button type="button" disabled={blocked} onClick={()=>setSelected(null)}>Cancelar</button></form>}
    {rows.map(c=><section className="operation-card" key={c.id}><h3>{c.nombre} · Documento {c.documento}</h3><p>Original {amount(c.monto)} · Saldo <strong>{amount(c.saldo)}</strong> · Vencimiento {formatFechaCalendario(c.vencimiento)} {c.vencida&&<strong className="operation-error">VENCIDA</strong>}</p>{Number(c.saldo)>0&&<button disabled={blocked} className="btn btn-primary" onClick={()=>{setSelected(c);setPayAmount(String(c.saldo));}}>Registrar {tipo==='CXC'?'abono':'pago'}</button>}<ul>{c.pagos.map((p:any)=><li key={p.id}>{fecha(p.created_at)} · {p.metodo} · {amount(p.monto)}</li>)}</ul></section>)}
   </>}
   {modo==='entregas'&&rows.map(v=><section className="operation-card" key={v.id}><h3>Venta {v.numero_venta} · {v.cliente_nombre||'Consumidor final'}</h3><p>{fecha(v.created_at)} · {amount(v.total)} · {v.metodo_pago}</p><ul>{v.items.map((i:any)=><li key={i.id}>{i.nombre} · {Number(i.cantidad)} {i.sin_inventario?'· Venta sin inventario':''}</li>)}</ul><button disabled={blocked} className="btn btn-primary" onClick={()=>void run(`/operaciones/ventas/${v.id}/entregar`,{})}>Confirmar entrega</button></section>)}
   {loading&&<p role="status">Cargando…</p>}{!loading&&rows.length===0&&<p>No hay registros.</p>}
  </main>
 </div>;
};
