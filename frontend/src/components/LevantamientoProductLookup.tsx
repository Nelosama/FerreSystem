import React, { useEffect, useRef, useState } from 'react';
import { api } from '../utils/api';
import { BarcodeScanner } from './BarcodeScanner';

export interface CountProduct {
  id: string; codigo: string; codigoBarras?: string | null; nombre: string;
  unidadMedida: string; stockActual: number | string; categoria?: { nombre: string } | null;
}

export const LevantamientoProductLookup: React.FC<{
  disabled?: boolean; onSearch(code: string): void; onSelect(product: CountProduct): void;
}> = ({ disabled, onSearch, onSelect }) => {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<CountProduct[]>([]);
  const [selected, setSelected] = useState<CountProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const blocked = useRef(disabled); blocked.current = disabled;
  useEffect(() => () => { generation.current++; request.current?.abort(); }, []);
  useEffect(() => { if (disabled) { generation.current++; request.current?.abort(); setLoading(false); } }, [disabled]);
  const choose = (product: CountProduct) => { if (!blocked.current) { setSelected(product); setProducts([]); setMessage(''); onSelect(product); } };
  const lookup = async (value: string, scanned = false) => {
    const code = value.trim();
    if (!code || blocked.current) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const current = ++generation.current;
    setSearch(code); setSelected(null); setProducts([]); setMessage(''); setLoading(true);
    onSearch(scanned ? code : '');
    try {
      const response = await api.get<CountProduct[]>('/productos', { params: { search: code }, signal: controller.signal });
      if (current !== generation.current || blocked.current) return;
      const rows = response.data;
      const exact = rows.filter(p => p.codigoBarras === code || p.codigo.toUpperCase() === code.toUpperCase());
      if (exact.length === 1) choose(exact[0]);
      else {
        setProducts(rows.slice(0, 20));
        setMessage(exact.length > 1 ? 'Código ambiguo. Seleccione y compruebe el producto.' : rows.length
          ? 'Seleccione el producto correcto; no se encontró una coincidencia exacta.'
          : 'Producto no encontrado. Busque por nombre o código interno, o complete un conteo nuevo para revisión. Escanear no crea productos.');
      }
    } catch (error: unknown) {
      if (controller.signal.aborted || current !== generation.current) return;
      const status = (error as { response?: { status?: number } }).response?.status;
      setMessage(status === 403 ? 'No tiene permiso para consultar el catálogo. Solicite acceso al administrador.'
        : 'No se pudo consultar el producto. Revise la conexión y vuelva a buscar; no se guardó ninguna captura.');
    } finally { if (current === generation.current) setLoading(false); }
  };
  return <section aria-label="Identificar producto para contar">
    <BarcodeScanner disabled={disabled || loading} onCode={code => void lookup(code, true)} />
    <label>Buscar por código o nombre<input className="form-input" type="search" value={search} disabled={disabled} onChange={e => setSearch(e.target.value)} onKeyDown={e => {
      if (e.key === 'Enter') { e.preventDefault(); void lookup(search); }
    }} /></label>
    <button type="button" className="btn btn-secondary" disabled={disabled || loading || !search.trim()} onClick={() => void lookup(search)}>Buscar producto</button>
    {loading && <p role="status">Buscando producto…</p>}
    {message && <p role="status">{message}</p>}
    {!!products.length && <ul>{products.map(p => <li key={p.id}><button type="button" disabled={disabled} onClick={() => choose(p)}>{p.codigo} · {p.nombre} · {p.unidadMedida}</button></li>)}</ul>}
    {selected && <div role="status"><strong>{selected.nombre}</strong><p>Código: {selected.codigo} · Barras: {selected.codigoBarras || 'Sin código de barras'}</p>
      <p>Unidad: {selected.unidadMedida} · Existencia física actual: {selected.stockActual}</p><p>Ingrese la cantidad física contada y pulse Guardar y siguiente.</p></div>}
  </section>;
};
