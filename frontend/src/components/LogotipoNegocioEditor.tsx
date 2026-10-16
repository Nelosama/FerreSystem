import React, { useEffect, useState } from 'react';
import { Box, ImageUp, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import { useLogotipoNegocio } from '../hooks/useLogotipoNegocio';
import {
  invalidarLogotipo,
  LIMITE_LOGOTIPO_BYTES,
  mensajeErrorLogotipo,
  TIPOS_LOGOTIPO_ACEPTADOS,
  type LogotipoMeta,
} from '../utils/logotipo';

interface LogotipoNegocioEditorProps {
  negocioId: string;
  nombreNegocio: string;
  logotipo: LogotipoMeta | null;
  onCambio: (logotipo: LogotipoMeta | null) => void;
}

/**
 * Carga, vista previa, reemplazo y eliminación del logotipo de un negocio (solo SUPERADMIN).
 * La validación del navegador es orientativa: el servidor revalida tipo real, tamaño y dimensiones.
 */
export const LogotipoNegocioEditor: React.FC<LogotipoNegocioEditorProps> = ({ negocioId, nombreNegocio, logotipo, onCambio }) => {
  const endpoint = `/admin/tenants/${negocioId}/logo`;
  const actual = useLogotipoNegocio(logotipo ? endpoint : null, logotipo?.actualizadoAt ?? null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [estado, setEstado] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!archivo) { setVistaPrevia(null); return; }
    const url = URL.createObjectURL(archivo);
    setVistaPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const seleccionar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const elegido = event.target.files?.[0] ?? null;
    event.target.value = '';
    setError(''); setEstado('');
    if (!elegido) { setArchivo(null); return; }
    if (!(TIPOS_LOGOTIPO_ACEPTADOS as readonly string[]).includes(elegido.type)) {
      setArchivo(null); setError('Formato no permitido. Use una imagen PNG, JPG o WEBP.'); return;
    }
    if (elegido.size > LIMITE_LOGOTIPO_BYTES) {
      setArchivo(null); setError('El archivo supera el límite de 2 MB. Elija una imagen más pequeña.'); return;
    }
    setArchivo(elegido);
  };

  const guardar = async () => {
    if (!archivo || ocupado) return;
    setOcupado(true); setError(''); setEstado('');
    try {
      const formulario = new FormData();
      formulario.append('archivo', archivo, archivo.name);
      // El cliente compartido envía application/json por defecto; sin ese encabezado el navegador añade el
      // multipart con su límite y el archivo llega al servidor.
      const { data } = await api.post<LogotipoMeta>(endpoint, formulario, { headers: { 'Content-Type': undefined } as any });
      invalidarLogotipo(endpoint);
      setArchivo(null);
      setEstado('Logotipo guardado. Ya se muestra en el negocio.');
      onCambio({ mime: data.mime, bytes: data.bytes, actualizadoAt: data.actualizadoAt });
    } catch (err: any) {
      setError(mensajeErrorLogotipo(err));
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    if (ocupado || !logotipo) return;
    if (!window.confirm(`¿Quitar el logotipo de ${nombreNegocio}? El negocio volverá a ver el ícono predeterminado.`)) return;
    setOcupado(true); setError(''); setEstado('');
    try {
      await api.delete(endpoint);
      invalidarLogotipo(endpoint);
      setArchivo(null);
      setEstado('Logotipo eliminado.');
      onCambio(null);
    } catch (err: any) {
      setError(mensajeErrorLogotipo(err));
    } finally {
      setOcupado(false);
    }
  };

  const mostrado = vistaPrevia ?? actual;

  return (
    <section className="industrial-card" aria-labelledby="logotipo-negocio" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h2 id="logotipo-negocio" style={{ fontSize: 15, textTransform: 'uppercase', margin: 0 }}>Logotipo del negocio</h2>
      <p style={{ margin: 0, fontSize: 13 }}>
        PNG, JPG o WEBP de hasta 2 MB. Se muestra en el menú, los encabezados, el punto de venta y los recibos de {nombreNegocio}.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div aria-label="Vista previa del logotipo" style={{ width: 160, height: 90, border: '1px dashed var(--color-border-subtle, #D6D3D1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#FFFFFF' }}>
          {mostrado
            ? <img src={mostrado} alt={`Logotipo de ${nombreNegocio}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <Box size={36} strokeWidth={2.2} color="var(--color-primary)" aria-hidden="true" />}
        </div>
        <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
          <strong>{vistaPrevia ? 'Vista previa (sin guardar)' : logotipo ? 'Logotipo actual' : 'Sin logotipo: se muestra el ícono predeterminado'}</strong>
          {logotipo && !vistaPrevia && <span>{logotipo.mime.replace('image/', '').toUpperCase()} · {Math.max(1, Math.round(logotipo.bytes / 1024))} KB</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: ocupado ? 'not-allowed' : 'pointer' }}>
          <ImageUp size={16} aria-hidden="true" />
          <span>{logotipo ? 'Elegir otro archivo' : 'Elegir archivo'}</span>
          {/* accept con tipos de imagen: en teléfonos ofrece galería o cámara según el sistema. */}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={seleccionar} disabled={ocupado} aria-label="Elegir archivo de logotipo" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} />
        </label>
        <button type="button" className="btn btn-primary" onClick={guardar} disabled={!archivo || ocupado}>
          {ocupado ? 'Guardando…' : 'Guardar logotipo'}
        </button>
        {archivo && <button type="button" className="btn btn-secondary" onClick={() => { setArchivo(null); setError(''); }} disabled={ocupado}>Cancelar</button>}
        {logotipo && !archivo && (
          <button type="button" className="btn btn-secondary" onClick={eliminar} disabled={ocupado} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Trash2 size={16} aria-hidden="true" /> Quitar logotipo
          </button>
        )}
      </div>

      {error && <p role="alert" style={{ color: '#B91C1C', margin: 0, fontWeight: 700 }}>{error}</p>}
      {estado && <p role="status" style={{ color: '#15803D', margin: 0, fontWeight: 700 }}>{estado}</p>}
    </section>
  );
};
