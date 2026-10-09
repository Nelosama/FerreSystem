import React,{useEffect,useState} from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { formatLempiras } from '../utils/format';
import { exportToCSV } from '../utils/csvExport';
import './OperacionesPage.css';

export const ReportesPage:React.FC=()=>{
 const {tenant}=useTenant();
 const {t}=useI18n();
 const [desde,setDesde]=useState(()=>new Date().toISOString().slice(0,8)+'01'),[hasta,setHasta]=useState(()=>new Date().toISOString().slice(0,10));
 const [data,setData]=useState<any>(null),[products,setProducts]=useState<any[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{let alive=true;setLoading(true);setError('');Promise.all([api.get('/operaciones/resumen',{params:{desde,hasta}}),api.get('/productos')]).then(([r,p])=>{if(alive){setData(r.data);setProducts(p.data);}}).catch(e=>{if(alive){setData(null);setError(e.response?.data?.message||t('reports.fetch_error'));}}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[desde,hasta,tenant.id,t]);
 const low=products.filter(p=>Number(p.stockDisponible??p.stockActual)<=Number(p.stockMinimo));
 const total=data?.metodos.reduce((sum:number,m:any)=>sum+Number(m.total||0),0)||0;
 return <div><TopBar title={t('reports.title')} subtitle={t('reports.subtitle')}/><main className="operation-page">
  <div className="operation-card operation-form"><label>{t('reports.from')}<input className="form-input" type="date" value={desde} onChange={e=>setDesde(e.target.value)}/></label><label>{t('reports.to')}<input className="form-input" type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/></label><p>{t('reports.dates_utc_notice')}</p></div>
  {error&&<p role="alert" className="operation-error">{error}</p>}{loading&&<p role="status">{t('reports.loading')}</p>}
  {data&&<><section className="operation-card"><h2>{t('reports.net_sales')} · {formatLempiras(total-Number(data.devoluciones?.[0]?.monto||0))}</h2><div className="operation-table"><table><thead><tr><th>{t('reports.method_col')}</th><th>{t('reports.sales_col')}</th><th>{t('reports.total_col')}</th></tr></thead><tbody>{data.metodos.map((m:any)=><tr key={m.metodo_pago}><td>{m.metodo_pago}</td><td>{m.cantidad}</td><td>{formatLempiras(Number(m.total))}</td></tr>)}</tbody></table></div><p>{t('reports.gross_sales_summary', { gross: formatLempiras(total), returns: formatLempiras(Number(data.devoluciones?.[0]?.monto||0)) })}</p><p>{t('reports.credit_sales_note')}</p><button className="btn btn-secondary" disabled={!data.metodos.length} onClick={()=>exportToCSV('ventas_por_metodo',data.metodos,[{key:'metodo_pago',label:t('reports.method_col')},{key:'cantidad',label:t('reports.sales_col')},{key:'total',label:t('reports.total_col')}])}>{t('reports.export_csv_btn')}</button></section>
   <section className="operation-card"><h2>{t('reports.top_products_title')}</h2><div className="operation-table"><table><thead><tr><th>{t('reports.code_col')}</th><th>{t('reports.product_col')}</th><th>{t('reports.quantity_col')}</th></tr></thead><tbody>{data.rotacion.map((p:any)=><tr key={p.id}><td>{p.codigo}</td><td>{p.nombre}</td><td>{Number(p.cantidad)}</td></tr>)}</tbody></table></div><p>{t('reports.top_products_note')}</p></section>
   <section className="operation-card"><h2>{t('reports.due_accounts_title')}</h2>{data.alertas.length?data.alertas.map((a:any)=><p key={a.tipo}>{t('reports.accounts_summary', { type: a.tipo==='CXC'?t('reports.cxc'):t('reports.cxp'), count: a.cantidad, amount: formatLempiras(Number(a.saldo)) })}</p>):<p>{t('reports.no_due_accounts')}</p>}</section></>}
  <section className="operation-card"><h2>{t('reports.stock_alerts_title')} · {low.length}</h2><div className="operation-table"><table><thead><tr><th>{t('reports.code_col')}</th><th>{t('reports.product_col')}</th><th>{t('reports.available_col')}</th><th>{t('reports.minimum_col')}</th></tr></thead><tbody>{low.map(p=><tr key={p.id}><td>{p.codigo}</td><td>{p.nombre}</td><td>{Number(p.stockDisponible??p.stockActual)}</td><td>{Number(p.stockMinimo)}</td></tr>)}</tbody></table></div></section>
 </main></div>;
};
