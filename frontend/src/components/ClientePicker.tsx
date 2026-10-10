import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useI18n } from '../context/I18nContext';
import { useTenant } from '../context/TenantContext';
import { formatNumeroCliente } from '../utils/numeroCliente';

export interface ClienteSeleccionable {
  id: string;
  numeroCliente?: number;
  nombre: string;
  rtn?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

export const ClientePicker: React.FC<{ onSelect: (cliente: ClienteSeleccionable) => void }> = ({ onSelect }) => {
  const { t } = useI18n();
  const { tenant } = useTenant();
  const [search, setSearch] = useState('');
  const [clientes, setClientes] = useState<ClienteSeleccionable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setClientes([]);
    const timer = setTimeout(async () => {
      try {
        const response = await api.get('/clientes/buscar', { params: { q: search.trim() } });
        if (active) setClientes(response.data);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, retry, tenant?.id]);

  return <div style={{ marginBottom: 16 }}>
    <label className="form-label" htmlFor="quotation-client-search">{t('clientPicker.label')}</label>
    <input id="quotation-client-search" className="form-input" type="search"
      placeholder={t('clientPicker.placeholder')} value={search}
      onChange={(event) => setSearch(event.target.value)} autoComplete="off" />
    <div aria-live="polite" style={{ marginTop: 8 }}>
      {loading && <p>{t('clientPicker.loading')}</p>}
      {error && <div role="alert">{t('clientPicker.error')} <button type="button" className="btn btn-secondary" onClick={() => setRetry((value) => value + 1)}>{t('clientPicker.retry')}</button></div>}
      {!loading && !error && clientes.length === 0 && <p>{t('clientPicker.empty')}</p>}
    </div>
    {!loading && !error && clientes.length > 0 && <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
      {clientes.map((cliente) => <button key={cliente.id} type="button" onClick={() => onSelect(cliente)}
        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'var(--color-card, white)', color: 'var(--color-text)', border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}>
        <strong>{formatNumeroCliente(cliente.numeroCliente)} · {cliente.nombre}</strong>
        <div style={{ fontSize: 12 }}>{cliente.rtn && `RTN: ${cliente.rtn} · `}{cliente.telefono || t('clientPicker.noPhone')}</div>
      </button>)}
    </div>}
    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>{t('clientPicker.manualHint')}</p>
  </div>;
};
