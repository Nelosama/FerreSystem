import React from 'react';
import { api } from '../utils/api';
import { useTenant } from '../context/TenantContext';
export const BackupStatus: React.FC = () => {
  const {user,tenant}=useTenant();
  const [status,setStatus]=React.useState<any>(null);
  const [error,setError]=React.useState(false);
  const [refresh,setRefresh]=React.useState(0);
  React.useEffect(()=>{
    if(user?.rol!=='ADMIN')return;
    let active=true;setStatus(null);setError(false);
    api.get('/maintenance/backup').then(response=>{if(active)setStatus(response.data);}).catch(()=>{if(active)setError(true);});
    return ()=>{active=false;};
  },[user?.id,user?.rol,tenant.id,refresh]);
  if(user?.rol!=='ADMIN')return null;
  return <section className="industrial-card" style={{marginBottom:24}} aria-label="Estado de respaldos">
    <h2>Respaldo de la base de datos</h2>
    {!status&&!error&&<p role="status">Consultando el último respaldo…</p>}
    {error&&<p role="alert">No se pudo consultar el estado de los respaldos.</p>}
    {status&&!status.configured&&<p>No hay respaldos automáticos configurados para consultar en este servidor. Solicita al responsable de instalación que los configure.</p>}
    {status?.configured&&!status.available&&<p role="alert">El servicio aún no informa un respaldo. Revisa su configuración antes de usar el sistema como principal.</p>}
    {status?.available&&<><p role={status.success&&!status.stale?'status':'alert'}>{status.stale?'El respaldo está desactualizado. Contacta al responsable de instalación.':status.success?'Se generó el último respaldo.':'Falló el último intento de respaldo. Contacta al responsable de instalación.'}</p><p>Último intento: {new Date(status.lastAttempt).toLocaleString('es-HN')}</p><p>{status.restoreTested?'Restauración técnica verificada.':'Falta comprobar la restauración de este respaldo en una base aislada.'}</p></>}
    <button className="btn btn-secondary" type="button" onClick={()=>setRefresh(value=>value+1)}>Actualizar estado del respaldo</button>
  </section>;
};
