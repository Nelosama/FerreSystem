import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { BarcodeScanner } from './BarcodeScanner';

export interface CountProduct {
  id: string; codigo: string; codigoBarras?: string | null; nombre: string;
  unidadMedida: string; stockActual: number | string; categoria?: { nombre: string } | null;
}

export const LevantamientoProductLookup: React.FC<{
  disabled?: boolean; onSearch(code: string): void; onSelect(product: CountProduct): void;
}> = ({ disabled, onSearch, onSelect }) => {
  const { t } = useI18n();
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
    if (scanned) onSearch(code);
    try {
      const response = await api.get<CountProduct[]>('/productos', { params: { search: code }, signal: controller.signal });
      if (current !== generation.current || blocked.current) return;
      const rows = response.data;
      const exact = rows.filter(p => p.codigoBarras === code || p.codigo.toUpperCase() === code.toUpperCase());
      if (exact.length === 1) choose(exact[0]);
      else {
        setProducts(rows.slice(0, 20));
        setMessage(exact.length > 1 ? t('count_lookup.ambiguous') : rows.length
          ? t('count_lookup.select')
          : scanned
            ? t('count_lookup.unknown_code')
            : t('count_lookup.not_found'));
      }
    } catch (error: unknown) {
      if (controller.signal.aborted || current !== generation.current) return;
      const status = (error as { response?: { status?: number } }).response?.status;
      setMessage(status === 403 ? t('count_lookup.denied')
        : t('count_lookup.error'));
    } finally { if (current === generation.current) setLoading(false); }
  };
  return <section aria-label={t('count_lookup.label')}>
    <BarcodeScanner disabled={disabled || loading} onCode={code => void lookup(code, true)} />
    <label>{t('count_lookup.search')}<input className="form-input" type="search" value={search} disabled={disabled} onChange={e => setSearch(e.target.value)} onKeyDown={e => {
      if (e.key === 'Enter') { e.preventDefault(); void lookup(search); }
    }} /></label>
    <button type="button" className="btn btn-secondary" disabled={disabled || loading || !search.trim()} onClick={() => void lookup(search)}>{t('count_lookup.button')}</button>
    {loading && <p role="status">{t('count_lookup.loading')}</p>}
    {message && <p role="status">{message}</p>}
    {!!products.length && <ul>{products.map(p => <li key={p.id}><button type="button" disabled={disabled} onClick={() => choose(p)}>{p.codigo} · {p.nombre} · {p.unidadMedida}</button></li>)}</ul>}
    {selected && <div role="status"><strong>{selected.nombre}</strong><p>{t('count_lookup.code', { code: selected.codigo, barcode: selected.codigoBarras || t('count_lookup.no_barcode') })}</p>
      <p>{t('count_lookup.stock', { unit: selected.unidadMedida, stock: selected.stockActual })}</p><p>{t('count_lookup.next')}</p></div>}
  </section>;
};
