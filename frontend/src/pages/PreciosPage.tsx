import { useCallback, useEffect, useMemo, useState } from 'react';
import { TopBar } from '../components/TopBar';
import { api } from '../utils/api';
import { formatInstanteNegocio, formatLempiras } from '../utils/format';
import { useI18n } from '../context/I18nContext';
import {
  cambiosDePrecio, datosCompletos, margenCalculado, puedeAprobar, type ProductoPrecio, validarPrecios,
} from '../utils/precios';
import './PreciosPage.css';

type Filtro = 'PENDIENTES' | 'APROBADOS' | 'TODOS';

/** Pantalla exclusiva del administrador: fija costo y precio, y aprueba productos para venta. */
export function PreciosPage() {
  const { t, locale } = useI18n();
  const [productos, setProductos] = useState<ProductoPrecio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('PENDIENTES');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [form, setForm] = useState({ costo: '', venta: '', motivo: '' });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const res = await api.get('/productos');
      setProductos(res.data as ProductoPrecio[]);
    } catch {
      setError(t('prices.error'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => { void cargar(); }, [cargar]);

  const seleccionado = useMemo(() => productos.find(p => p.id === seleccionadoId) ?? null, [productos, seleccionadoId]);

  // El formulario parte de los precios guardados; cambia al elegir producto o tras guardar (nueva versión).
  useEffect(() => {
    if (!seleccionado) return;
    setForm(actual => ({ ...actual, costo: String(seleccionado.precioCosto), venta: String(seleccionado.precioVenta) }));
  }, [seleccionado?.id, seleccionado?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Los mensajes pertenecen a la operación en curso: se limpian solo al cambiar de producto.
  useEffect(() => { setMensaje(''); setError(''); }, [seleccionadoId]);

  const pendientes = useMemo(() => productos.filter(p => !p.precioAprobado).length, [productos]);

  const lista = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return productos
      .filter(p => filtro === 'TODOS' || (filtro === 'PENDIENTES' ? !p.precioAprobado : p.precioAprobado))
      .filter(p => !termino || p.nombre.toLowerCase().includes(termino) || p.codigo.toLowerCase().includes(termino))
      .sort((a, b) => Number(a.precioAprobado) - Number(b.precioAprobado) || a.nombre.localeCompare(b.nombre));
  }, [productos, filtro, busqueda]);

  const margenVista = margenCalculado(Number(form.costo), Number(form.venta));

  const guardar = async (aprobar: boolean) => {
    if (!seleccionado) return;
    const errores = validarPrecios(form.costo, form.venta);
    if (errores.length) { setError(t('prices.invalid')); return; }
    if (aprobar && !puedeAprobar(form.venta)) { setError(t('prices.approve_needs_price')); return; }
    const { payload, hayCambios } = cambiosDePrecio(seleccionado, form.costo, form.venta);
    if (!hayCambios && !aprobar) { setMensaje(t('prices.no_changes')); return; }
    setGuardando(true); setError(''); setMensaje('');
    try {
      await api.patch(`/productos/${seleccionado.id}/precios`, {
        version: seleccionado.version,
        ...payload,
        ...(aprobar ? { aprobar: true } : {}),
        ...(form.motivo.trim() ? { motivo: form.motivo.trim() } : {}),
      });
      await cargar();
      setMensaje(aprobar ? t('prices.approved') : t('prices.saved'));
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setError(t('prices.conflict'));
        await cargar();
      } else {
        setError(err?.response?.data?.message && typeof err.response.data.message === 'string' ? err.response.data.message : t('prices.error'));
      }
    } finally {
      setGuardando(false);
    }
  };

  const filtros: { valor: Filtro; etiqueta: string }[] = [
    { valor: 'PENDIENTES', etiqueta: t('prices.filter_pending') },
    { valor: 'APROBADOS', etiqueta: t('prices.filter_approved') },
    { valor: 'TODOS', etiqueta: t('prices.filter_all') },
  ];

  return (
    <div className="precios-page">
      <TopBar title={t('prices.title')} subtitle={t('prices.subtitle')} />
      <div className="precios-resumen" role="status">
        {t('prices.count_pending', { n: pendientes })}
      </div>
      <div className="precios-layout">
        <section className="precios-lista" aria-label={t('prices.title')}>
          <div className="precios-filtros" role="group" aria-label={t('prices.title')}>
            {filtros.map(f => (
              <button
                key={f.valor}
                type="button"
                className={`btn ${filtro === f.valor ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={filtro === f.valor}
                onClick={() => setFiltro(f.valor)}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>
          <input
            className="form-input"
            type="search"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder={t('prices.search')}
            aria-label={t('prices.search')}
          />
          {cargando && <p>…</p>}
          {!cargando && lista.length === 0 && <p className="precios-vacio">{t('prices.empty')}</p>}
          <ul className="precios-items">
            {lista.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`precios-item ${p.id === seleccionadoId ? 'is-active' : ''}`}
                  aria-current={p.id === seleccionadoId ? 'true' : undefined}
                  onClick={() => { setSeleccionadoId(p.id); setForm(actual => ({ ...actual, motivo: '' })); }}
                >
                  <span className="precios-item-nombre">{p.nombre}</span>
                  <span className="precios-item-codigo">{p.codigo}</span>
                  <span className="precios-item-cifras">
                    {formatLempiras(Number(p.precioCosto))} → {formatLempiras(Number(p.precioVenta))}
                    {' · '}{margenCalculado(p.precioCosto, p.precioVenta) ?? '—'}%
                  </span>
                  <span className="precios-badges">
                    <span className={`badge ${p.precioAprobado ? 'badge-success' : 'badge-warning'}`}>
                      {p.precioAprobado ? t('prices.approved_state') : t('prices.pending_state')}
                    </span>
                    <span className={`badge ${datosCompletos(p) ? 'badge-success' : 'badge-warning'}`}>
                      {datosCompletos(p) ? t('prices.complete') : t('prices.incomplete')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="precios-editor" aria-label={seleccionado?.nombre ?? t('prices.title')}>
          {!seleccionado && <p className="precios-vacio">{t('prices.pick')}</p>}
          {seleccionado && (
            <form onSubmit={e => { e.preventDefault(); void guardar(false); }} className="precios-form">
              <h2 className="precios-titulo">{seleccionado.nombre}</h2>
              <p className="precios-meta">{seleccionado.codigo} · {t('prices.stock')}: {Number(seleccionado.stockActual)}</p>
              {seleccionado.precioAprobado ? (
                <p className="precios-estado">
                  {t('prices.approved_by', {
                    nombre: seleccionado.precioAprobadoPorNombre ?? t('prices.legacy'),
                    fecha: seleccionado.precioAprobadoAt ? formatInstanteNegocio(seleccionado.precioAprobadoAt, locale === 'en' ? 'en-US' : 'es-HN') : '—',
                  })}
                </p>
              ) : (
                <p className="precios-estado precios-estado--pendiente">{t('prices.pending_state')}</p>
              )}
              {seleccionado.precioModificadoPorNombre && seleccionado.precioModificadoAt && (
                <p className="precios-meta">
                  {t('prices.modified_by', {
                    nombre: seleccionado.precioModificadoPorNombre,
                    fecha: formatInstanteNegocio(seleccionado.precioModificadoAt, locale === 'en' ? 'en-US' : 'es-HN'),
                  })}
                </p>
              )}

              <div className="precios-campos">
                <label>
                  {t('prices.cost')}
                  <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01"
                    value={form.costo} onChange={e => setForm({ ...form, costo: e.target.value })} disabled={guardando} />
                </label>
                <label>
                  {t('prices.price')}
                  <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01"
                    value={form.venta} onChange={e => setForm({ ...form, venta: e.target.value })} disabled={guardando} />
                </label>
                <div className="precios-margen" aria-live="polite">
                  <span>{t('prices.margin')}</span>
                  <strong>{margenVista === null ? '—' : `${margenVista.toFixed(2)} %`}</strong>
                  <small>{t('prices.margin_hint')}</small>
                </div>
              </div>

              <label>
                {t('prices.reason')}
                <input className="form-input" type="text" maxLength={300} value={form.motivo}
                  onChange={e => setForm({ ...form, motivo: e.target.value })} disabled={guardando} />
              </label>

              {error && <p role="alert" className="precios-error">{error}</p>}
              {mensaje && <p role="status" className="precios-ok">{mensaje}</p>}

              <div className="precios-acciones">
                <button type="submit" className="btn btn-secondary" disabled={guardando}>{t('prices.save')}</button>
                {!seleccionado.precioAprobado && (
                  <button type="button" className="btn btn-primary" disabled={guardando || !puedeAprobar(form.venta)}
                    onClick={() => void guardar(true)}>
                    {t('prices.approve')}
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
