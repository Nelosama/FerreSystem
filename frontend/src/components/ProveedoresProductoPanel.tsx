import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { formatLempiras } from '../utils/format';

// Proveedores asociados a un producto: código del proveedor, preferido y último costo recibido.
// El costo vigente del producto no se edita aquí: cambia solo por recepción de compra.
type Vinculo = {
  id: string; proveedor_id: string; proveedor_nombre: string; codigo_proveedor: string | null;
  es_preferido: boolean; ultimo_costo: number | null; ultima_compra_at: string | null;
};
type ProveedorOpcion = { id: string; nombre: string };

export const ProveedoresProductoPanel: React.FC<{ productoId: string; productoNombre: string; soloLectura: boolean }> = ({ productoId, productoNombre, soloLectura }) => {
  const { t } = useI18n();
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorOpcion[]>([]);
  const [proveedorId, setProveedorId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [preferido, setPreferido] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const mensajeDeError = (e: any) => {
    const m = e?.response?.data?.message;
    return Array.isArray(m) ? m.join(', ') : m || t('supplier_link.error');
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [vinc, provs] = await Promise.all([
        api.get(`/operaciones/productos/${productoId}/proveedores`),
        api.get('/operaciones/proveedores'),
      ]);
      setVinculos(vinc.data);
      setProveedores(provs.data);
      setError('');
    } catch (e: any) {
      setError(e?.response ? mensajeDeError(e) : t('supplier_link.network'));
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId, t]);

  useEffect(() => { void cargar(); }, [cargar]);

  const disponibles = proveedores.filter(p => !vinculos.some(v => v.proveedor_id === p.id));

  const guardar = async (proveedor: string, codigoProveedor: string | null, esPreferido: boolean) => {
    if (guardando) return;
    setGuardando(true); setError(''); setMensaje('');
    try {
      const res = await api.put(`/operaciones/productos/${productoId}/proveedores/${proveedor}`, { codigoProveedor, esPreferido });
      setVinculos(res.data);
      setMensaje(t('supplier_link.saved'));
    } catch (e: any) {
      setError(e?.response ? mensajeDeError(e) : t('supplier_link.network'));
    } finally {
      setGuardando(false);
    }
  };

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proveedorId) { setError(t('supplier_link.choose_supplier')); return; }
    await guardar(proveedorId, codigo.trim() || null, preferido);
    setProveedorId(''); setCodigo(''); setPreferido(false);
  };

  const quitar = async (proveedor: string) => {
    if (guardando || !window.confirm(t('supplier_link.confirm_remove'))) return;
    setGuardando(true); setError(''); setMensaje('');
    try {
      await api.delete(`/operaciones/productos/${productoId}/proveedores/${proveedor}`);
      setVinculos(v => v.filter(x => x.proveedor_id !== proveedor));
      setMensaje(t('supplier_link.removed'));
    } catch (e: any) {
      setError(e?.response ? mensajeDeError(e) : t('supplier_link.network'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="operation-card supplier-link-panel" aria-labelledby="supplier-link-title">
      <h3 id="supplier-link-title">{t('supplier_link.title')} · {productoNombre}</h3>
      <p>{t('supplier_link.help')}</p>
      {error && <div className="operation-error" role="alert">{error}</div>}
      {mensaje && <div className="operation-success" role="status">{mensaje}</div>}
      {cargando ? <p>{t('supplier_link.loading')}</p> : vinculos.length === 0 ? <p>{t('supplier_link.empty')}</p> : (
        <div className="operation-table">
          <table>
            <thead><tr>
              <th>{t('supplier_link.supplier')}</th><th>{t('supplier_link.code')}</th><th>{t('supplier_link.preferred')}</th>
              <th>{t('supplier_link.last_cost')}</th><th>{t('supplier_link.last_purchase')}</th>{!soloLectura && <th />}
            </tr></thead>
            <tbody>{vinculos.map(v => (
              <tr key={v.id}>
                <td>{v.proveedor_nombre}</td>
                <td>{v.codigo_proveedor ?? '—'}</td>
                <td>{v.es_preferido ? t('supplier_link.yes') : t('supplier_link.no')}</td>
                <td>{v.ultimo_costo === null ? '—' : formatLempiras(v.ultimo_costo)}</td>
                <td>{v.ultima_compra_at ? new Date(v.ultima_compra_at).toLocaleDateString() : '—'}</td>
                {!soloLectura && <td className="operation-actions">
                  {!v.es_preferido && <button type="button" disabled={guardando} onClick={() => guardar(v.proveedor_id, v.codigo_proveedor, true)}>{t('supplier_link.make_preferred')}</button>}
                  <button type="button" disabled={guardando} onClick={() => quitar(v.proveedor_id)}>{t('supplier_link.remove')}</button>
                </td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {!soloLectura && (
        <form className="operation-form" onSubmit={agregar} aria-label={t('supplier_link.add')}>
          <label>{t('supplier_link.supplier')}
            <select className="form-input" aria-label={t('supplier_link.supplier')} value={proveedorId} disabled={guardando} onChange={e => setProveedorId(e.target.value)}>
              <option value="">{t('supplier_link.choose_supplier')}</option>
              {disponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label>{t('supplier_link.code')}
            <input className="form-input" aria-label={t('supplier_link.code')} maxLength={100} value={codigo} disabled={guardando} onChange={e => setCodigo(e.target.value)} />
          </label>
          <label><input type="checkbox" aria-label={t('supplier_link.preferred')} checked={preferido} disabled={guardando} onChange={e => setPreferido(e.target.checked)} /> {t('supplier_link.preferred')}</label>
          <button type="submit" disabled={guardando || !proveedorId}>{guardando ? t('supplier_link.saving') : t('supplier_link.add')}</button>
        </form>
      )}
    </section>
  );
};
