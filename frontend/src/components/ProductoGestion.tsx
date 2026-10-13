import React, { useRef, useState } from 'react';
import { ProveedoresProductoPanel } from './ProveedoresProductoPanel';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { formatLempiras } from '../utils/format';
import { construirCambiosProducto, formularioDesde, validarFormularioProducto, type FormularioProducto } from '../utils/productoEdicion';
import '../pages/OperacionesPage.css';

const UNIDADES = ['UNIDAD', 'PIE', 'METRO', 'METRO_CUADRADO', 'METRO_CUBICO', 'LIBRA', 'KG', 'GALON', 'LITRO', 'CAJA', 'PAQUETE', 'OTRO'];

/** Grupos lógicos del formulario de edición (FS-07). Cada clave se traduce en product_edit.field.* */
const GRUPOS: { titulo: string; campos: { k: string; tipo?: 'texto' | 'numero' | 'select' | 'check'; requerido?: boolean; ayuda?: string }[] }[] = [
  { titulo: 'group_identity', campos: [
    { k: 'nombre', requerido: true },
    { k: 'codigo', requerido: true },
    { k: 'codigoBarras' },
    { k: 'codigoFabricante' },
    { k: 'descripcion' },
  ] },
  { titulo: 'group_classification', campos: [
    { k: 'marca', ayuda: 'marca' },
    { k: 'categoria', ayuda: 'categoria' },
    { k: 'unidadMedida', tipo: 'select', ayuda: 'unidad' },
    { k: 'usaMedida', tipo: 'check' },
  ] },
  { titulo: 'group_stock', campos: [
    { k: 'stockMinimo', tipo: 'numero' },
  ] },
  { titulo: 'group_status', campos: [
    { k: 'activo', tipo: 'check', ayuda: 'activo' },
  ] },
  { titulo: 'group_image', campos: [
    { k: 'imagenUrl', ayuda: 'imagen' },
  ] },
];

export const ProductoGestion: React.FC<{ productos: any[]; onSaved: () => Promise<void> }> = ({ productos, onSaved }) => {
  const { isReadOnly, user } = useTenant();
  const { t } = useI18n();
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState<FormularioProducto>({});
  const [history, setHistory] = useState<any>(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [busy, setBusy] = useState(false);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [listaInactivos, setListaInactivos] = useState<any[] | null>(null);
  // Guarda contra doble envío: el estado React puede tardar en reflejar el primer clic.
  const enviando = useRef(false);

  const opciones = listaInactivos ?? productos;
  const stockCambia = !!selected && String(form.stockActual ?? '').trim() !== '' && Number(form.stockActual) !== Number(selected.stockActual);

  const mensajeDeError = (e: any) => {
    const m = e.response?.data?.message;
    return Array.isArray(m) ? m.join(', ') : m || t('product_edit.error');
  };

  const cargarInactivos = async (activar: boolean) => {
    setMostrarInactivos(activar);
    if (!activar) { setListaInactivos(null); return; }
    try {
      setListaInactivos((await api.get('/productos', { params: { incluirInactivos: 'true' } })).data);
    } catch (e: any) {
      setError(e.response ? mensajeDeError(e) : t('product_edit.network'));
    }
  };

  const elegir = (id: string) => {
    const p = opciones.find(x => x.id === id);
    setSelected(p || null);
    setForm(p ? formularioDesde(p) : {});
    setHistory(null); setError(''); setMensaje('');
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando.current || busy || isReadOnly || !selected) return;
    setError(''); setMensaje('');

    const errores = validarFormularioProducto(form, selected);
    if (errores.length) {
      setError(errores.map(x => `${t(`product_edit.field.${x.campo}`)}: ${t(`product_edit.errors.${x.motivo}`)}`).join(' · '));
      return;
    }
    const { payload, cambiados, sensibles } = construirCambiosProducto(selected, form);
    if (!cambiados.length) { setMensaje(t('product_edit.no_changes')); return; }
    if (cambiados.includes('stockActual') && !String(form.motivo ?? '').trim()) {
      setError(t('product_edit.errors.motivo'));
      return;
    }
    if (sensibles.length && !window.confirm(t('product_edit.confirm_sensitive', { campos: sensibles.map(c => t(`product_edit.sensitive.${c}`)).join(', ') }))) return;

    enviando.current = true; setBusy(true);
    try {
      await api.put(`/productos/${selected.id}`, payload);
      setMensaje(t('product_edit.saved'));
      setSelected(null); setForm({});
      await onSaved();
      if (mostrarInactivos) await cargarInactivos(true);
    } catch (err: any) {
      if (['PRODUCTO_VERSION', 'PRODUCTO_STOCK'].includes(err.response?.data?.code)) {
        // Otro usuario cambió el producto: no se sobrescribe; se recarga la lista para que el usuario revise.
        setError(t('product_edit.conflict'));
        setSelected(null);
        await onSaved();
      } else {
        setError(err.response ? mensajeDeError(err) : t('product_edit.network'));
      }
    } finally {
      enviando.current = false; setBusy(false);
    }
  };

  const verHistorial = async () => {
    if (enviando.current || busy) return;
    setBusy(true);
    try { setHistory((await api.get(`/operaciones/productos/${selected.id}/historial`)).data); }
    catch (e: any) { setError(mensajeDeError(e)); }
    finally { setBusy(false); }
  };

  const renderCampo = (campo: { k: string; tipo?: string; requerido?: boolean; ayuda?: string }) => {
    // Decisión 3: costo, precio y margen los cambia solo ADMIN; el campo se muestra, no se edita.
    const soloAdmin = ['precioVenta', 'precioCosto', 'margen'].includes(campo.k) && user?.rol !== 'ADMIN';
    if (soloAdmin) return null;
    const deshabilitado = busy || isReadOnly;
    const ayuda = campo.ayuda ? <small className="form-hint">{t(`product_edit.hint.${campo.ayuda}`)}</small> : null;
    if (campo.tipo === 'check') {
      return (
        <label key={campo.k}>
          <input type="checkbox" disabled={deshabilitado} checked={form[campo.k] === true}
            onChange={e => setForm({ ...form, [campo.k]: e.target.checked })} /> {t(`product_edit.field.${campo.k}`)}
          {ayuda}
        </label>
      );
    }
    if (campo.tipo === 'select') {
      return (
        <label key={campo.k}>{t(`product_edit.field.${campo.k}`)}
          <select className="form-input" disabled={deshabilitado} value={String(form[campo.k] ?? '')}
            onChange={e => setForm({ ...form, [campo.k]: e.target.value })}>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          {ayuda}
        </label>
      );
    }
    return (
      <label key={campo.k}>{t(`product_edit.field.${campo.k}`)}
        <input className="form-input" disabled={deshabilitado} required={!!campo.requerido}
          type={campo.tipo === 'numero' ? 'number' : 'text'} min={campo.tipo === 'numero' ? '0' : undefined}
          step={campo.tipo === 'numero' ? '0.01' : undefined}
          value={String(form[campo.k] ?? '')} onChange={e => setForm({ ...form, [campo.k]: e.target.value })} />
        {ayuda}
      </label>
    );
  };

  return (
    <section className="operation-card">
      <h2>{t('product_edit.title')}</h2>
      {user?.rol === 'ADMIN' && (
        <label className="form-hint">
          <input type="checkbox" checked={mostrarInactivos} disabled={busy}
            onChange={e => void cargarInactivos(e.target.checked)} /> {t('product_edit.show_inactive')}
        </label>
      )}
      <label>{t('product_edit.select_label')}
        <select className="form-input" disabled={busy} value={selected?.id || ''} onChange={e => elegir(e.target.value)}>
          <option value="">{t('product_edit.select_placeholder')}</option>
          {opciones.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}{p.activo === false ? ` ${t('product_edit.inactive_suffix')}` : ''}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="operation-error">{error}</p>}
      {mensaje && <p role="status" className="operation-card">✅ {mensaje}</p>}

      {selected && (
        <>
          <p>{t('product_edit.stock_now', { stock: Number(selected.stockActual), reserved: Number(selected.stockReservado || 0), available: Number(selected.stockDisponible ?? selected.stockActual) })}</p>
          <form className="operation-form" onSubmit={guardar} noValidate>
            {GRUPOS.map(grupo => (
              <fieldset key={grupo.titulo} className="operation-form" disabled={busy || isReadOnly}>
                <legend>{t(`product_edit.${grupo.titulo}`)}</legend>
                {grupo.campos.map(renderCampo)}
                {grupo.titulo === 'group_stock' && (
                  <>
                    {renderCampo({ k: 'stockActual', tipo: 'numero' })}
                    {stockCambia && (
                      <label>{t('product_edit.field.motivo')}
                        <input className="form-input" required disabled={busy || isReadOnly} value={String(form.motivo ?? '')}
                          onChange={e => setForm({ ...form, motivo: e.target.value })} />
                        <small className="form-hint">{t('product_edit.hint.motivo')}</small>
                      </label>
                    )}
                  </>
                )}
              </fieldset>
            ))}
            <button className="btn btn-primary" disabled={busy || isReadOnly}>
              {busy ? t('product_edit.saving') : t('product_edit.save')}
            </button>
          </form>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={verHistorial}>{t('product_edit.movements')}</button>
        </>
      )}

      {selected && <ProveedoresProductoPanel productoId={selected.id} productoNombre={selected.nombre} soloLectura={isReadOnly} />}
      {history && (
        <>
          <h3>{t('product_edit.history_title')}</h3>
          <div className="operation-table"><table><thead><tr>
            <th>{t('product_edit.history.date')}</th><th>{t('product_edit.history.origin')}</th><th>{t('product_edit.history.before')}</th>
            <th>{t('product_edit.history.change')}</th><th>{t('product_edit.history.after')}</th><th>{t('product_edit.history.user_reason')}</th>
          </tr></thead><tbody>{history.movimientos.map((m: any) => <tr key={m.id}>
            <td>{new Date(m.created_at).toLocaleString()}</td><td>{m.tipo}</td><td>{Number(m.anterior)}</td><td>{Number(m.cantidad)}</td><td>{Number(m.nuevo)}</td><td>{m.usuario_nombre} · {m.motivo}</td>
          </tr>)}</tbody></table></div>
          <h3>{t('product_edit.purchases_title')}</h3>
          <ul>{history.costos.map((c: any) => <li key={c.id}>{new Date(c.fecha).toLocaleString()} · {c.proveedor_nombre} · {t('product_edit.invoice')} {c.numero_factura} · {Number(c.cantidad)} × {formatLempiras(Number(c.costo))}</li>)}</ul>
        </>
      )}
    </section>
  );
};
