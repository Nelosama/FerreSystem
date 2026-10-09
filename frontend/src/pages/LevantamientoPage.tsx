import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../utils/api';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { exportToCSV } from '../utils/csvExport';
import { exportToExcel } from '../utils/excelExport';
import './OperacionesPage.css';
import { LevantamientoProductLookup } from '../components/LevantamientoProductLookup';
import { readStoredJson } from '../utils/storage';

const blank = () => ({
  descripcion: '', cantidad: '1', unidad: 'UNIDAD',
  codigo: '', codigoBarras: '', marca: '', categoria: '',
  ubicacion: '', precioCosto: '', precioVenta: '', margen: '', notas: '', productoId: '',
});
/** Misma identidad que el servidor: producto, código interno o código de barras (sin distinguir mayúsculas). */
const identidadCoincide = (item: any, f: { productoId?: string; codigo?: string; codigoBarras?: string }) => {
  const codigo = f.codigo?.trim().toUpperCase();
  const barras = f.codigoBarras?.trim();
  return (!!f.productoId && item.productoId === f.productoId)
    || (!!codigo && !!item.codigo && item.codigo.trim().toUpperCase() === codigo)
    || (!!barras && !!item.codigoBarras && item.codigoBarras.trim() === barras);
};
const CLAVE_LEVANTAMIENTO = (tenantId: string, userId?: string) => `ferre_pending_levantamiento:${tenantId}:${userId}`;
const message = (e: any) => {
  const m = e.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar. Revise la conexión y reintente.';
};

/** Banner con usuarios activos en este levantamiento */
function ParticipantesBanner({ lid }: { lid: string }) {
  const [participantes, setParticipantes] = useState<any[]>([]);
  useEffect(() => {
    if (!lid) return;
    const fetch = async () => {
      try { setParticipantes((await api.get(`/levantamientos/${lid}/participantes`)).data); }
      catch { /* silencioso — no bloquear UI */ }
    };
    void fetch();
    const t = setInterval(fetch, 30_000);
    return () => clearInterval(t);
  }, [lid]);
  if (participantes.length <= 1) return null;
  return (
    <div className="operation-card" style={{ background: 'var(--color-info-bg,#e0f2fe)', borderLeft: '4px solid #0284c7', padding: '8px 12px' }}>
      <strong>👥 Usuarios activos ahora:</strong>{' '}
      {participantes.map(p => p.nombreUsuario).join(', ')}
      <span style={{ color: '#64748b', fontSize: '0.85em' }}> — Los conteos de cada usuario se muestran por separado</span>
    </div>
  );
}

/** Bloque de resolución de conflictos */
function ConflictosPanel({
  lid, onResolved, busy, isReadOnly,
}: { lid: string; onResolved: () => void; busy: boolean; isReadOnly: boolean }) {
  const [grupos, setGrupos] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [resolviendo, setResolviendo] = useState(false);

  const cargar = useCallback(async () => {
    try { setGrupos((await api.get(`/levantamientos/${lid}/conflictos`)).data); }
    catch (e) { setError(message(e)); }
  }, [lid]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (!grupos.length) return null;

  const conciliar = async (mantenerItemId: string, cantidadManual?: number) => {
    if (resolviendo || isReadOnly) return;
    setResolviendo(true); setError('');
    try {
      await api.post(`/levantamientos/${lid}/conciliar`, { mantenerItemId, ...(cantidadManual != null ? { cantidadManual } : {}) });
      await cargar();
      onResolved();
    } catch (e) { setError(message(e)); }
    finally { setResolviendo(false); }
  };

  return (
    <section className="operation-card" style={{ borderLeft: '4px solid #f59e0b' }}>
      <h2>⚠️ Conflictos pendientes de conciliar</h2>
      <p>Los siguientes productos fueron contados por más de un usuario. El administrador debe elegir qué conteo conservar.
        <strong> No se suma ni se elige automáticamente.</strong>
      </p>
      {error && <div role="alert" className="operation-error">{error}</div>}
      {grupos.map(grupo => (
        <div key={grupo.key} className="operation-card" style={{ marginBottom: 12 }}>
          <strong>Producto / clave: {grupo.key}</strong>
          <div className="operation-table" style={{ marginTop: 6 }}>
            <table>
              <thead><tr><th>Usuario</th><th>Descripción</th><th>Cantidad</th><th>Zona</th><th>Acción</th></tr></thead>
              <tbody>
                {grupo.items.map((item: any) => (
                  <ConflictoFila key={item.id} item={item} disabled={resolviendo || busy} onConciliar={conciliar} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

/** Fila de conflicto: el valor manual es estado propio de cada fila (no se puede usar un hook dentro de un map). */
function ConflictoFila({ item, disabled, onConciliar }: { item: any; disabled: boolean; onConciliar: (id: string, cantidad?: number) => void }) {
  const [manual, setManual] = useState<string>('');
  return (
    <tr style={{ background: '#fefce8' }}>
      <td>{item.contadorId ?? '—'}</td>
      <td>{item.descripcion}</td>
      <td>{Number(item.cantidad)} {item.unidad}</td>
      <td>{item.ubicacion || '—'}</td>
      <td style={{ minWidth: 260 }}>
        <button
          className="btn btn-primary"
          disabled={disabled}
          onClick={() => onConciliar(item.id)}
          style={{ marginRight: 4, marginBottom: 4 }}
        >
          Conservar este ({Number(item.cantidad)})
        </button>
        <span style={{ display: 'block', fontSize: '0.85em', color: '#64748b', marginBottom: 4 }}>o cantidad manual:</span>
        <input
          type="number" min="0" step="0.01"
          style={{ width: 80, marginRight: 4 }}
          placeholder="Cant."
          value={manual}
          onChange={e => setManual(e.target.value)}
        />
        <button
          className="btn btn-secondary"
          disabled={disabled || manual === ''}
          onClick={() => onConciliar(item.id, Number(manual))}
        >
          Usar {manual || '…'}
        </button>
      </td>
    </tr>
  );
}

export const LevantamientoPage: React.FC = () => {
  const { tenant, user, isReadOnly } = useTenant();
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeId, setActiveId] = useState('');
  const [active, setActive] = useState<any>(null);
  const [nombre, setNombre] = useState('');
  const [form, setForm] = useState(blank());
  const [editing, setEditing] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lookupRevision, setLookupRevision] = useState(0);
  const [ultimoGuardado, setUltimoGuardado] = useState('');
  const inFlight = useRef(false);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const pendingKey = `ferre_pending_count:${tenant.id}:${user?.id}`;
  const [pendingCount, setPendingCount] = useState<any>(() => readStoredJson(pendingKey, null));
  useEffect(() => { setPendingCount(readStoredJson(pendingKey, null)); }, [pendingKey]);

  const closed = active?.estado === 'FINALIZADO' || !!active?.aplicadoAt;
  const hayConflictos = active?.items?.some((i: any) => i.conflicto) ?? false;
  const coincidentes: any[] = (active?.items ?? []).filter((i: any) => i.id !== editing?.id && identidadCoincide(i, form));
  const propia = coincidentes.find((i: any) => i.contadorId === user?.id);
  const ajenas = coincidentes.filter((i: any) => i.contadorId !== user?.id);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions((await api.get('/levantamientos')).data);
      if (activeId) setActive((await api.get(`/levantamientos/${activeId}`)).data);
      else setActive(null);
    } catch (e) { setError(message(e)); }
    finally { setLoading(false); }
  }, [activeId, tenant.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setActiveId(''); setActive(null); setPreview(null); setEditing(null); setForm(blank()); }, [tenant.id]);

  // Heartbeat: registrar presencia mientras se está en un levantamiento activo
  useEffect(() => {
    if (!activeId || !user || closed) {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      return;
    }
    const send = () => api.post(`/levantamientos/${activeId}/heartbeat`, { nombreUsuario: user.nombre || user.email || 'Usuario' }).catch(() => { /* silencioso */ });
    void send();
    heartbeatTimer.current = setInterval(send, 60_000);
    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      // Limpiar sesión al salir
      void api.delete(`/levantamientos/${activeId}/heartbeat`).catch(() => { /* silencioso */ });
    };
  }, [activeId, user, closed]);

  const action = async (fn: () => Promise<void>) => {
    if (inFlight.current || isReadOnly) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await fn(); await load(); }
    catch (e) { setError(message(e)); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const sendCount = async (command: any) => {
    try { await api.post(`/levantamientos/${command.lid}/items`, command.dto); }
    catch (e: any) {
      if ([400, 403, 404, 409, 422].includes(e.response?.status)) {
        localStorage.removeItem(pendingKey); setPendingCount(null);
      }
      throw e;
    }
    localStorage.removeItem(pendingKey); setPendingCount(null);
    // Confirmación visible también al confirmar un conteo pendiente tras un fallo de red.
    setUltimoGuardado(`Guardado: ${command.dto.descripcion} · ${command.dto.cantidad} ${command.dto.unidad}`);
    setLookupRevision(v => v + 1);
    setForm(f => ({ ...blank(), unidad: f.unidad, ubicacion: f.ubicacion }));
    setPreview(null);
  };

  const exportRows = () => active.items.map((i: any) => ({
    codigo: i.codigo || '', codigoBarras: i.codigoBarras || '', descripcion: i.descripcion,
    cantidad: Number(i.cantidad), unidad: i.unidad, categoria: i.categoria || '',
    costo: i.precioCosto ?? '', precio: i.precioVenta ?? '', margen: i.margen ?? '',
    ubicacion: i.ubicacion || '', marca: i.marca || '', notas: i.notas || '',
    contador: i.contadorId || '', conflicto: i.conflicto ? 'Sí' : '',
  }));

  const set = (key: keyof ReturnType<typeof blank>, value: string) => setForm(f => ({ ...f, [key]: value }));
  const editarItem = (i: any) => {
    setEditing(i); setError('');
    setForm(Object.fromEntries(Object.keys(blank()).map(k => [k, i[k] == null ? '' : String(i[k])])) as ReturnType<typeof blank>);
  };

  return (
    <div>
      <TopBar title="LEVANTAMIENTO DE INVENTARIO" subtitle="Conteo multiusuario, revisión y aplicación al inventario" />
      <main className="operation-page">
        {error && <div role="alert" className="operation-error">{error}</div>}
        {loading && <p role="status">Cargando…</p>}
        {pendingCount && (
          <div className="operation-error" role="alert">
            Hay un conteo pendiente de confirmar. Reintente para consultar o guardar la misma operación.
            <button className="btn btn-secondary" disabled={busy || isReadOnly}
              onClick={() => void action(async () => { await sendCount(pendingCount); })}>
              Confirmar conteo pendiente
            </button>
          </div>
        )}
        <div className="operation-actions">
          <button className="btn btn-secondary" disabled={busy} onClick={() => void load()}>Actualizar</button>
          {activeId && (
            <button className="btn btn-secondary" onClick={() => {
              setActiveId(''); setPreview(null); setEditing(null); setForm(blank());
            }}>Volver a levantamientos</button>
          )}
        </div>

        {/* Lista de levantamientos */}
        {!activeId && (
          <>
            <form className="operation-card operation-form" onSubmit={e => {
              e.preventDefault();
              void action(async () => {
                const claveLev = CLAVE_LEVANTAMIENTO(tenant.id, user?.id);
                const nombreLimpio = nombre.trim();
                const previo = readStoredJson<any>(claveLev, null);
                const solicitud = previo && previo.nombre === nombreLimpio ? previo : { nombre: nombreLimpio, solicitudId: crypto.randomUUID() };
                localStorage.setItem(claveLev, JSON.stringify(solicitud));
                try {
                  const r = await api.post('/levantamientos', solicitud);
                  localStorage.removeItem(claveLev);
                  setNombre(''); setActiveId(r.data.id);
                } catch (e: any) {
                  // Solo un error de validación o de clave reutilizada descarta la clave; un fallo de red la conserva para reintentar.
                  if ([400, 409, 422].includes(e.response?.status)) localStorage.removeItem(claveLev);
                  throw e;
                }
              });
            }}>
              <label>Nombre del levantamiento
                <input className="form-input" required value={nombre} disabled={busy || isReadOnly}
                  onChange={e => setNombre(e.target.value)} />
              </label>
              <button className="btn btn-primary" disabled={busy || isReadOnly}>Crear levantamiento</button>
            </form>
            {sessions.map(s => (
              <button className="operation-card" style={{ textAlign: 'left' }} key={s.id}
                onClick={() => { setActiveId(s.id); setPreview(null); }}>
                <strong>{s.nombre}</strong> · {s.estado} · {s.totalItems} artículos
                {s.aplicadoAt && ' · Aplicado'}
              </button>
            ))}
          </>
        )}

        {/* Levantamiento activo */}
        {active && (
          <>
            {/* Banner de participantes activos */}
            {activeId && !closed && <ParticipantesBanner lid={activeId} />}

            {/* Header del levantamiento */}
            <section className="operation-card">
              <h2>{active.nombre} · {active.estado}</h2>
              {active.aplicadoAt
                ? <p>Aplicado al inventario el {new Date(active.aplicadoAt).toLocaleString('es-HN')}. El conteo original se conserva.</p>
                : <p>Finalizar cierra el conteo. Aplicar al inventario es una acción separada del administrador.</p>
              }
              <div className="operation-actions">
                {!closed && (
                  <button className="btn btn-secondary" disabled={busy || isReadOnly || !active.items.length}
                    onClick={() => {
                      if (window.confirm('¿Finalizar este conteo sin modificar inventario todavía?'))
                        void action(async () => { await api.patch(`/levantamientos/${activeId}`, { estado: 'FINALIZADO' }); });
                    }}>Finalizar conteo</button>
                )}
                {active.estado === 'FINALIZADO' && !active.aplicadoAt && user?.rol === 'ADMIN' && (
                  <button className="btn btn-secondary" disabled={busy || isReadOnly}
                    onClick={() => void action(async () => { await api.patch(`/levantamientos/${activeId}`, { estado: 'REVISION' }); setPreview(null); })}>
                    Reabrir para conciliar
                  </button>
                )}
                {!active.aplicadoAt && (
                  <button className="btn btn-primary" disabled={busy || isReadOnly || hayConflictos}
                    title={hayConflictos ? 'Concilie los conflictos primero' : undefined}
                    onClick={() => void action(async () => { setPreview((await api.get(`/levantamientos/${activeId}/preview`)).data); })}>
                    Revisar impacto en inventario
                    {hayConflictos && ' ⚠️'}
                  </button>
                )}
                <button className="btn btn-secondary" disabled={!active.items.length}
                  onClick={() => { const rows = exportRows(); exportToCSV(`levantamiento_${active.id}.csv`, rows, Object.keys(rows[0]).map(key => ({ key, label: key }))); }}>
                  Exportar CSV
                </button>
                <button className="btn btn-secondary" disabled={!active.items.length}
                  onClick={() => exportToExcel(`levantamiento_${active.id}`, exportRows())}>
                  Exportar Excel
                </button>
              </div>
            </section>

            {/* Panel de conflictos — solo ADMIN y si los hay */}
            {user?.rol === 'ADMIN' && hayConflictos && (
              <ConflictosPanel lid={activeId} onResolved={load} busy={busy} isReadOnly={isReadOnly} />
            )}
            {user?.rol !== 'ADMIN' && hayConflictos && (
              <div className="operation-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                <strong>⚠️ Hay conteos en conflicto</strong> — El administrador debe conciliarlos antes de aplicar al inventario.
              </div>
            )}

            {/* Formulario de conteo */}
            {!closed && (
              <form className="operation-card" onSubmit={e => {
                e.preventDefault();
                void action(async () => {
                  if (propia) throw new Error('Este artículo ya está en el conteo. Edite el conteo anterior; no se suma.');
                  const dto: any = {
                    ...form, cantidad: Number(form.cantidad),
                    codigo: form.codigo || undefined,
                    codigoBarras: form.codigoBarras || undefined,
                    productoId: form.productoId || undefined,
                  };
                  for (const key of ['precioCosto', 'precioVenta', 'margen'] as const)
                    dto[key] = form[key] === '' ? undefined : Number(form[key]);
                  if (editing) {
                    await api.patch(`/levantamientos/${activeId}/items/${editing.id}`, { ...dto, version: editing.version });
                  } else {
                    if (pendingCount) throw new Error('Confirme el conteo pendiente');
                    const command = { lid: activeId, dto: { ...dto, solicitudId: crypto.randomUUID() } };
                    localStorage.setItem(pendingKey, JSON.stringify(command));
                    setPendingCount(command);
                    await sendCount(command);
                  }
                  setUltimoGuardado(`${editing ? 'Corrección guardada' : 'Guardado'}: ${dto.descripcion} · ${dto.cantidad} ${dto.unidad}`);
                  setForm(f => ({ ...blank(), unidad: f.unidad, ubicacion: f.ubicacion }));
                  setEditing(null); setPreview(null);
                });
              }}>
                <LevantamientoProductLookup
                  key={`${tenant.id}:${user?.id}:${activeId}:${editing?.id || ''}:${lookupRevision}`}
                  disabled={busy || isReadOnly || !!pendingCount || !!editing}
                  onSearch={code => { setForm(f => ({ ...blank(), ubicacion: f.ubicacion, codigoBarras: code })); setPreview(null); }}
                  onSelect={product => { setForm(f => ({ ...blank(), ubicacion: f.ubicacion, productoId: product.id, descripcion: product.nombre, codigo: product.codigo, codigoBarras: product.codigoBarras || '', unidad: product.unidadMedida, categoria: product.categoria?.nombre || '', cantidad: '' })); setPreview(null); }}
                />
                {ultimoGuardado && <p role="status" className="operation-card">✅ {ultimoGuardado}</p>}
                <h2>{editing ? 'Corregir conteo' : 'Contar producto'}</h2>
                {propia && (
                  <div role="alert" className="operation-error">
                    <strong>Este artículo ya está en el conteo.</strong> Cantidad registrada: {Number(propia.cantidad)} {propia.unidad}.
                    No se suma: corrija ese conteo.{' '}
                    <button type="button" className="btn btn-secondary" onClick={() => editarItem(propia)}>Editar conteo anterior</button>
                  </div>
                )}
                {!propia && ajenas.length > 0 && (
                  <div role="status" className="operation-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                    <strong>⚠️ Otro usuario ya contó este artículo</strong> (cantidad {ajenas.map((a: any) => Number(a.cantidad)).join(', ')}).
                    Al guardar quedará en conflicto para que el administrador concilie. No se suma.
                  </div>
                )}
                <fieldset disabled={busy || isReadOnly || !!pendingCount} className="operation-form">
                  <label>Descripción y variante
                    <input className="form-input" required value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Tipo, medida, espesor, color…" />
                  </label>
                  <label>Cantidad
                    <input className="form-input" type="number" min="0" step="0.01" required value={form.cantidad} onChange={e => set('cantidad', e.target.value)} />
                  </label>
                  <label>Unidad
                    <select className="form-input" value={form.unidad} onChange={e => set('unidad', e.target.value)}>
                      {['UNIDAD', 'PIE', 'METRO', 'METRO_CUADRADO', 'METRO_CUBICO', 'LIBRA', 'KG', 'GALON', 'LITRO', 'CAJA', 'PAQUETE', 'OTRO'].map(u => <option key={u}>{u}</option>)}
                    </select>
                  </label>
                  {(['codigo', 'codigoBarras', 'marca', 'categoria', 'ubicacion', 'precioCosto', 'precioVenta', 'margen', 'notas'] as const).map(key => (
                    <label key={key}>
                      {{ codigo: 'Código interno o fabricante (opcional)', codigoBarras: 'Código de barras (opcional)', marca: 'Marca', categoria: 'Categoría', ubicacion: 'Zona o ubicación', precioCosto: 'Costo', precioVenta: 'Precio de venta', margen: 'Margen %', notas: 'Notas' }[key]}
                      <input className="form-input" type={['precioCosto', 'precioVenta', 'margen'].includes(key) ? 'number' : 'text'}
                        min="0" step="0.01" max={key === 'margen' ? 100 : undefined}
                        value={form[key]} onChange={e => set(key, e.target.value)} />
                    </label>
                  ))}
                </fieldset>
                <p>Si el producto es nuevo, complete costo y precio antes de aplicar. Los artículos sin código recibirán uno interno.</p>
                <button className="btn btn-primary" disabled={busy || isReadOnly || !!pendingCount || !!propia}>Guardar y siguiente</button>
                {editing && <button className="btn btn-secondary" type="button" onClick={() => { setEditing(null); setForm(blank()); }}>Cancelar corrección</button>}
              </form>
            )}

            {/* Tabla de ítems — columna contador y badge de conflicto */}
            <div className="operation-table operation-card">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th><th>Código</th><th>Cantidad</th><th>Zona</th>
                    <th>Contador</th><th>Costo / precio</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {active.items.map((i: any) => (
                    <tr key={i.id} style={i.conflicto ? { background: '#fef9c3' } : undefined}>
                      <td>
                        {i.conflicto && <span title="Conflicto: otro usuario contó el mismo producto" style={{ marginRight: 4 }}>⚠️</span>}
                        {i.descripcion}
                      </td>
                      <td>{i.codigo || i.codigoBarras || 'Sin código'}</td>
                      <td>{Number(i.cantidad)} {i.unidad}</td>
                      <td>{i.ubicacion}</td>
                      <td style={{ fontSize: '0.85em', color: '#64748b' }}>{i.contadorId ?? '—'}</td>
                      <td>{i.precioCosto ?? '—'} / {i.precioVenta ?? '—'}</td>
                      <td>
                        {!closed && (
                          <>
                            <button disabled={busy || isReadOnly} onClick={() => editarItem(i)}>Corregir</button>
                            <button disabled={busy || isReadOnly} onClick={() => {
                              if (window.confirm('¿Eliminar este conteo?'))
                                void action(async () => {
                                  await api.delete(`/levantamientos/${activeId}/items/${i.id}`, { params: { version: i.version } });
                                  setPreview(null);
                                });
                            }}>Eliminar</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Vista previa de aplicación */}
            {preview && (
              <section className="operation-card">
                <h2>Vista previa de aplicación</h2>
                <p>Las cantidades revisadas sustituirán las existencias indicadas. Si cambia el inventario, será necesario revisar nuevamente.</p>
                <div className="operation-table">
                  <table>
                    <thead><tr><th>Producto</th><th>Antes</th><th>Conteo</th><th>Revisión</th></tr></thead>
                    <tbody>
                      {preview.rows.map((r: any) => (
                        <tr key={r.item.id} style={r.errores.length ? { background: '#fee2e2' } : undefined}>
                          <td>{r.codigo} · {r.nombre}</td>
                          <td>{r.anterior}</td>
                          <td>{r.nuevo}</td>
                          <td>{r.errores.length ? r.errores.join('; ') : r.productoId ? 'Actualizar existente' : 'Crear producto'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {user?.rol === 'ADMIN' && (
                  <button
                    className="btn btn-primary"
                    disabled={busy || isReadOnly || active.estado !== 'FINALIZADO' || !preview.rows.length || preview.rows.some((r: any) => r.errores.length)}
                    onClick={() => {
                      if (window.confirm('¿Aplicar este conteo revisado al inventario?'))
                        void action(async () => {
                          await api.post(`/levantamientos/${activeId}/aplicar`, { token: preview.token });
                          setPreview(null);
                        });
                    }}>
                    Aplicar al inventario
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};
