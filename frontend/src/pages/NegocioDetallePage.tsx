import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { NegocioNavigation } from '../components/NegocioNavigation';
import { api } from '../utils/api';
import { alertas } from '../utils/alertas';
import { ModuleControls } from '../components/ModuleControls';
import { CATALOGO_MODULOS } from '../config/modulesCatalog';
import { useI18n } from '../context/I18nContext';
import { LogotipoNegocioEditor } from '../components/LogotipoNegocioEditor';
import { AvisoColorMarca } from '../components/AvisoColorMarca';
import { estiloMarcaNegocio, inicialesNegocio } from '../utils/identidadNegocio';

type Registro = { id: string; nombre: string; email?: string; username?: string; rol?: string; activo?: boolean; activa?: boolean; direccion?: string; telefono?: string; permisos?: string[]; descuentoMaximo?: number; bloqueadoAt?: string | null };
const mensaje = (error: any) => { const value = error.response?.data?.message; return Array.isArray(value) ? value.join(', ') : value || 'No se pudo completar la operación. Sus cambios se conservan; vuelva a intentar.'; };

function GestionRegistros({ negocioId, tipo }: { negocioId: string; tipo: 'usuarios' | 'sucursales' }) {
  const { t } = useI18n();
  const endpoint = `/admin/tenants/${negocioId}/${tipo}`;
  const usuarios = tipo === 'usuarios';
  const [filas, setFilas] = useState<Registro[]>([]);
  const [form, setForm] = useState<Partial<Registro> & { password?: string } | null>(null);
  const [error, setError] = useState('');
  const [estado, setEstado] = useState('');
  const [busy, setBusy] = useState(false);
  const [permisosEditados, setPermisosEditados] = useState(false);
  const cargar = async () => { const { data } = await api.get(endpoint, { params: usuarios ? { gestion: true } : {} }); setFilas(data); };
  useEffect(() => {
    let vigente = true;
    api.get(endpoint, { params: usuarios ? { gestion: true } : {} }).then(({ data }) => { if (vigente) setFilas(data); }).catch(e => { if (vigente) setError(mensaje(e)); });
    return () => { vigente = false; };
  }, [endpoint, usuarios]);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form || busy) return;
    setBusy(true); setError(''); setEstado('');
    const body = usuarios ? { nombre: form.nombre, ...(form.email && { email: form.email }), ...(form.username && { username: form.username }), rol: form.rol, activo: form.activo, ...(permisosEditados && { permisos: form.permisos ?? [] }), descuentoMaximo: Number(form.descuentoMaximo || 0) } : { nombre: form.nombre, direccion: form.direccion || '', telefono: form.telefono || '', activa: form.activa };
    try {
      if (form.id) await api.patch(`${endpoint}/${form.id}`, body); else await api.post(endpoint, body);
      setForm(null); setEstado('Cambios guardados.'); await cargar();
    } catch (e) { setError(mensaje(e)); } finally { setBusy(false); }
  };
  const toggle = async (fila: Registro) => {
    const activo = usuarios ? fila.activo : fila.activa;
    if (!(await alertas.confirmar({ texto: `¿${activo ? 'Desactivar' : 'Reactivar'} ${fila.nombre}? Se conserva su historial.`, confirmar: activo ? 'Desactivar' : 'Reactivar', peligroso: activo }))) return;
    setBusy(true); setError(''); setEstado('');
    try { await api.patch(`${endpoint}/${fila.id}`, usuarios ? { activo: !activo } : { activa: !activo }); setEstado('Estado actualizado.'); await cargar(); }
    catch (e) { setError(mensaje(e)); } finally { setBusy(false); }
  };
  // Cuenta bloqueada por intentos fallidos: el Super Admin la reactiva en cualquier negocio. No cambia la contraseña.
  const desbloquear = async (fila: Registro) => {
    if (!(await alertas.confirmar({ texto: `¿Reactivar a ${fila.nombre}? Podrá volver a iniciar sesión con su contraseña actual.`, confirmar: 'Reactivar' }))) return;
    setBusy(true); setError(''); setEstado('');
    try { await api.post('/auth/security/unlock', { usuarioId: fila.id, tenantId: negocioId }); setEstado('Cuenta reactivada.'); await cargar(); }
    catch (e) { setError(mensaje(e)); } finally { setBusy(false); }
  };
  return <section className="industrial-card negocio-management">
    <h2>{usuarios ? 'Usuarios del negocio' : 'Sucursales del negocio'}</h2>
    <p>{usuarios ? 'Administre cuentas, roles y acceso. El último administrador activo está protegido.' : 'Administre los datos y el estado de las sucursales.'} La desactivación conserva la trazabilidad.</p>
    {error && <p role="alert">{error}</p>}{estado && <p role="status">{estado}</p>}
    <button className="btn btn-primary" disabled={busy} onClick={() => { setError(''); setEstado(''); setPermisosEditados(false); setForm(usuarios ? { nombre: '', email: '', rol: 'CAJERO', activo: true, descuentoMaximo: 0 } : { nombre: '', direccion: '', telefono: '', activa: true }); }}>{usuarios ? 'Crear usuario' : 'Crear sucursal'}</button>
    {form && <form onSubmit={guardar} className="negocio-form" aria-label={usuarios ? 'Datos del usuario' : 'Datos de la sucursal'}>
      <label>Nombre<input className="form-input" required maxLength={100} value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} /></label>
      {usuarios ? <>
        <label>Correo electrónico<input className="form-input" type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label>Rol<select aria-label="Rol" className="form-input" value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>{['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO'].map(rol => <option key={rol}>{rol}</option>)}</select></label>
<label>{t('shell.login.email')}<input className="form-input" value={form.username || ''} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="danielcm / 44556" /></label><p>{t('security.employee_help')}</p>
        <fieldset><legend>Permisos de operación</legend><p>Los roles siguen limitando el acceso. Guarde una selección solo si desea definir permisos individuales.</p>
          {Object.entries({ 'pos.vender': 'Vender', 'pos.aplicar_descuento': 'Aplicar descuentos', 'caja.movimientos_manuales': 'Movimientos manuales de caja', 'inventario.ver': 'Consultar inventario', 'inventario.editar': 'Editar inventario', 'cotizaciones.crear': 'Crear cotizaciones', 'cotizaciones.aprobar': 'Aprobar cotizaciones', 'cotizaciones.convertir_venta': 'Convertir cotizaciones', 'reportes.ver': 'Ver reportes', 'usuarios.gestionar': 'Gestionar usuarios' }).map(([key,label]) => <label key={key}><input type="checkbox" checked={form.permisos?.includes(key) || false} onChange={e => { setPermisosEditados(true); setForm({ ...form, permisos: e.target.checked ? [...(form.permisos || []), key] : (form.permisos || []).filter(p => p !== key) }); }} />{label}</label>)}
        </fieldset>
        <label>Descuento máximo (%)<input className="form-input" type="number" min={0} max={100} step="0.01" value={form.descuentoMaximo || 0} onChange={e => setForm({ ...form, descuentoMaximo: Number(e.target.value) })} /></label>
      </> : <>
        <label>Dirección<input className="form-input" maxLength={500} value={form.direccion || ''} onChange={e => setForm({ ...form, direccion: e.target.value })} /></label>
        <label>Teléfono<input className="form-input" maxLength={40} value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} /></label>
      </>}
      <label><input type="checkbox" checked={usuarios ? form.activo : form.activa} onChange={e => setForm({ ...form, ...(usuarios ? { activo: e.target.checked } : { activa: e.target.checked }) })} /> {usuarios ? 'Usuario activo' : 'Sucursal activa'}</label>
      <div><button className="btn btn-primary" disabled={busy}>Guardar</button> <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setForm(null)}>Cancelar</button></div>
    </form>}
    <div className="table-container"><table className="industrial-table"><thead><tr><th>Nombre</th><th>{usuarios ? 'Correo / rol' : 'Dirección / teléfono'}</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {filas.map(fila => <tr key={fila.id}><td>{fila.nombre}</td><td>{usuarios ? `${fila.email || fila.username || ''} · ${fila.rol}` : `${fila.direccion} · ${fila.telefono}`}</td><td>{(usuarios ? fila.activo : fila.activa) ? 'Activo' : 'Inactivo'}{usuarios && fila.bloqueadoAt ? ' · Bloqueada por intentos fallidos' : ''}</td><td><button className="btn btn-secondary" disabled={busy} onClick={() => { setPermisosEditados(false); setForm({ ...fila }); setError(''); }}>Editar</button> <button className="btn btn-secondary" disabled={busy} onClick={() => void toggle(fila)}>{(usuarios ? fila.activo : fila.activa) ? 'Desactivar' : 'Reactivar'}</button>{usuarios && fila.bloqueadoAt && <> <button className="btn btn-primary" disabled={busy} onClick={() => void desbloquear(fila)}>Desbloquear</button></>}</td></tr>)}
      {!filas.length && <tr><td colSpan={4}>No hay registros.</td></tr>}
    </tbody></table></div>
  </section>;
}

export function NegocioDetallePage({ negocioId, tab = 'resumen' }: { negocioId: string; tab?: string }) {
  const { t } = useI18n();
  const [negocio, setNegocio] = useState<any>(null);
  const [conteos, setConteos] = useState<{ sucursales?: number; usuarios?: number }>({});
  const [modulos, setModulos] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [estado, setEstado] = useState('');
  const [busy, setBusy] = useState(false);
  const [marca, setMarca] = useState<any>({});
  useEffect(() => {
    let active = true;
    api.get(`/admin/tenants/${negocioId}/settings`).then(({ data }) => {
      if (!active) return; setNegocio(data); setMarca({ nombreComercial: data.nombreComercial, colorPrimario: data.colorPrimario }); setModulos(data.modulosHabilitados || []);
    }).catch(e => { if (active) setError(mensaje(e)); });
    return () => { active = false; };
  }, [negocioId]);
  // Métricas de cabecera: se muestran «—» si el listado no está disponible.
  useEffect(() => {
    let active = true;
    Promise.allSettled([api.get(`/admin/tenants/${negocioId}/sucursales`), api.get(`/admin/tenants/${negocioId}/usuarios`, { params: { gestion: true } })]).then(([sucursales, usuarios]) => {
      if (!active) return;
      setConteos({
        sucursales: sucursales.status === 'fulfilled' && Array.isArray(sucursales.value.data) ? sucursales.value.data.length : undefined,
        usuarios: usuarios.status === 'fulfilled' && Array.isArray(usuarios.value.data) ? usuarios.value.data.length : undefined,
      });
    });
    return () => { active = false; };
  }, [negocioId]);
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    if (tab === 'servicios' && negocio.modulosHabilitados?.some((key: string) => !modulos.includes(key)) && !(await alertas.confirmar({ texto: t('modules.confirm'), peligroso: true }))) return;
    setBusy(true); setError(''); setEstado('');
    try {
      if (tab === 'servicios') await api.put(`/admin/tenants/${negocioId}/modules`, { modules: CATALOGO_MODULOS.map(m => ({ moduleKey: m.key, enabled: modulos.includes(m.key) })) });
      else { const { data } = await api.put(`/admin/tenants/${negocioId}/settings`, marca); setNegocio(data); }
      const { data: updated } = await api.get(`/admin/tenants/${negocioId}/settings`); setNegocio(updated); setModulos(updated.modulosHabilitados || []);
      setEstado('Cambios guardados.');
    } catch (e) { setError(mensaje(e)); } finally { setBusy(false); }
  };
  const nombre = negocio?.nombreComercial || 'Negocio';
  return <div><main className="platform-content negocio-detail">
    <nav className="platform-breadcrumb" aria-label="Ruta de navegación">
      <Link to="/admin?seccion=negocios">Negocios</Link><span aria-hidden="true">›</span><span aria-current="page">{nombre}</span>
    </nav>
    <header className="platform-biz-head">
      <span className="jowa-tenant-mark-lg" style={estiloMarcaNegocio(negocio?.colorPrimario)} aria-hidden="true">{inicialesNegocio(negocio?.nombreComercial)}</span>
      <div>
        <h1>{nombre}</h1>
        <p className="platform-biz-metrics">
          <span><strong>{conteos.sucursales ?? '—'}</strong> sucursales</span>
          <span className="platform-metric--secundaria"><strong>{conteos.usuarios ?? '—'}</strong> usuarios</span>
          <span className="platform-metric--secundaria"><strong>{modulos.length}</strong> de {CATALOGO_MODULOS.length} servicios</span>
        </p>
      </div>
    </header>
    <NegocioNavigation negocioId={negocioId} />
    {error && <p role="alert">{error}</p>}{estado && <p role="status">{estado}</p>}
    {negocio && tab === 'resumen' && <><section className="industrial-card negocio-management"><h1>{negocio.nombreComercial}</h1><p>Estado: {negocio.estado} · Plan: {negocio.plan}</p><p>{negocio.direccion} · {negocio.telefono} · {negocio.email}</p><p>Idioma: {negocio.idioma === 'en' ? 'English' : 'Español'}</p></section><GestionRegistros key={negocioId} negocioId={negocioId} tipo="sucursales" /></>}
    {negocio && tab === 'usuarios' && <GestionRegistros key={negocioId} negocioId={negocioId} tipo="usuarios" />}
    {negocio && tab === 'servicios' && <form onSubmit={guardar} className="industrial-card negocio-management"><h1>Servicios del negocio</h1><ModuleControls value={modulos} onChange={setModulos} disabled={busy} /><Link to={`/admin/negocios/${negocioId}/auditoria`}>{t('modules.audit')}</Link><button className="btn btn-primary" disabled={busy}>Guardar servicios</button></form>}
    {negocio && tab === 'marca' && <><LogotipoNegocioEditor negocioId={negocioId} nombreNegocio={negocio.nombreComercial} logotipo={negocio.logotipo} onCambio={logotipo => setNegocio({ ...negocio, logotipo })} /><form className="industrial-card negocio-management negocio-form" onSubmit={guardar}><h1>Marca</h1><label>Nombre comercial<input className="form-input" required value={marca.nombreComercial} onChange={e => setMarca({ ...marca, nombreComercial: e.target.value })} /></label><div className="jowa-brand-grid"><div className="jowa-brand-controls"><label>{t('shell.brand.primary_color')}<span className="jowa-color-input"><input type="color" aria-label={t('shell.brand.primary_color')} value={marca.colorPrimario} onChange={e => setMarca({ ...marca, colorPrimario: e.target.value })} /><code>{marca.colorPrimario}</code></span></label><AvisoColorMarca color={marca.colorPrimario} /><button className="btn btn-primary" disabled={busy}>Guardar marca</button></div><aside className="jowa-brand-preview" aria-label={t('shell.brand.preview')} style={estiloMarcaNegocio(marca.colorPrimario)}><small>{t('shell.brand.preview')}</small><div className="jowa-preview-shell"><div className="jowa-preview-menu"><strong>{marca.nombreComercial || negocio.nombreComercial}</strong><span className="on">{t('shell.brand.point_of_sale')}</span><span>{t('shell.brand.cash_drawer')}</span><span>{t('shell.brand.quotations')}</span></div><div className="jowa-preview-main"><b>{t('shell.brand.point_of_sale')}</b><div className="jowa-preview-search" /><div className="jowa-preview-cards"><i /><i /><i /><i /></div><div className="jowa-preview-cobrar">{t('shell.brand.charge')}</div></div></div><p>{t('shell.brand.preview_help')}</p></aside></div></form></>}
  </main></div>;
}
