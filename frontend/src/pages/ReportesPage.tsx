import React,{useEffect,useState} from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { api } from '../utils/api';
import { formatLempiras } from '../utils/format';
import { exportToCSV } from '../utils/csvExport';
import './OperacionesPage.css';
export const ReportesPage:React.FC=()=>{
 const {tenant}=useTenant();
 const [desde,setDesde]=useState(()=>new Date().toISOString().slice(0,8)+'01'),[hasta,setHasta]=useState(()=>new Date().toISOString().slice(0,10));
 const [data,setData]=useState<any>(null),[products,setProducts]=useState<any[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{let alive=true;setLoading(true);setError('');Promise.all([api.get('/operaciones/resumen',{params:{desde,hasta}}),api.get('/productos')]).then(([r,p])=>{if(alive){setData(r.data);setProducts(p.data);}}).catch(e=>{if(alive){setData(null);setError(e.response?.data?.message||'No se pudieron consultar los reportes');}}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[desde,hasta,tenant.id]);
 const low=products.filter(p=>Number(p.stockDisponible??p.stockActual)<=Number(p.stockMinimo));
 const total=data?.metodos.reduce((sum:number,m:any)=>sum+Number(m.total||0),0)||0;
 return <div><TopBar title="REPORTES" subtitle="Ventas, inventario y vencimientos desde la base de datos"/><main className="operation-page">
  <div className="operation-card operation-form"><label>Desde<input className="form-input" type="date" value={desde} onChange={e=>setDesde(e.target.value)}/></label><label>Hasta<input className="form-input" type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/></label><p>Fechas del reporte en UTC.</p></div>
  {error&&<p role="alert" className="operation-error">{error}</p>}{loading&&<p role="status">Cargando…</p>}
  {data&&<><section className="operation-card"><h2>Ventas netas · {formatLempiras(total-Number(data.devoluciones?.[0]?.monto||0))}</h2><div className="operation-table"><table><thead><tr><th>Método</th><th>Ventas</th><th>Total</th></tr></thead><tbody>{data.metodos.map((m:any)=><tr key={m.metodo_pago}><td>{m.metodo_pago}</td><td>{m.cantidad}</td><td>{formatLempiras(Number(m.total))}</td></tr>)}</tbody></table></div><p>Ventas brutas: {formatLempiras(total)} · Devoluciones del período: {formatLempiras(Number(data.devoluciones?.[0]?.monto||0))}</p><p>Las ventas a crédito son ventas registradas; sus abonos se consultan en Cuentas. Este reporte considera todos los registros del período.</p><button className="btn btn-secondary" disabled={!data.metodos.length} onClick={()=>exportToCSV('ventas_por_metodo',data.metodos,[{key:'metodo_pago',label:'Método'},{key:'cantidad',label:'Cantidad'},{key:'total',label:'Total'}])}>Exportar CSV</button></section>
   <section className="operation-card"><h2>Productos con mayor venta física</h2><div className="operation-table"><table><thead><tr><th>Código</th><th>Producto</th><th>Cantidad</th></tr></thead><tbody>{data.rotacion.map((p:any)=><tr key={p.id}><td>{p.codigo}</td><td>{p.nombre}</td><td>{Number(p.cantidad)}</td></tr>)}</tbody></table></div><p>Excluye ventas sin inventario. Se muestran los 30 productos con mayor movimiento.</p></section>
   <section className="operation-card"><h2>Cuentas vencidas o próximas a vencer</h2>{data.alertas.length?data.alertas.map((a:any)=><p key={a.tipo}>{a.tipo==='CXC'?'Por cobrar':'Por pagar'} · {a.cantidad} cuentas · {formatLempiras(Number(a.saldo))}</p>):<p>Sin saldos con vencimiento en los próximos siete días.</p>}</section></>}
  <section className="operation-card"><h2>Alertas de stock mínimo · {low.length}</h2><div className="operation-table"><table><thead><tr><th>Código</th><th>Producto</th><th>Disponible</th><th>Mínimo</th></tr></thead><tbody>{low.map(p=><tr key={p.id}><td>{p.codigo}</td><td>{p.nombre}</td><td>{Number(p.stockDisponible??p.stockActual)}</td><td>{Number(p.stockMinimo)}</td></tr>)}</tbody></table></div></section>
 </main></div>;
};
