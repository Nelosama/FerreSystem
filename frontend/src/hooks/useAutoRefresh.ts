import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { startAutoRefresh, type SyncSnapshot } from '../utils/autoRefresh';

interface UseAutoRefreshOptions<T> {
  load: (signal: AbortSignal) => Promise<T>;
  apply: (value: T) => void;
  intervalMs: number;
  enabled?: boolean;
  // Cambiar cualquiera de estos valores cancela la consulta anterior y vuelve a cargar (p. ej. filtros o sucursal).
  deps: DependencyList;
}

const SIN_SINCRONIZAR: SyncSnapshot = { phase: 'idle', lastSync: null };

// Carga al montar, refresca cada `intervalMs`, al volver a la pestaña y al recuperar la red, y
// cancela todo al desmontar. Devuelve `refresh` para actualizar tras una operación confirmada.
export function useAutoRefresh<T>({ load, apply, intervalMs, enabled = true, deps }: UseAutoRefreshOptions<T>) {
  const loadRef = useRef(load);
  const applyRef = useRef(apply);
  const handleRef = useRef<{ refresh(): Promise<void> } | null>(null);
  const [sync, setSync] = useState<SyncSnapshot>(SIN_SINCRONIZAR);

  useEffect(() => {
    loadRef.current = load;
    applyRef.current = apply;
  });

  useEffect(() => {
    if (!enabled) {
      handleRef.current = null;
      return undefined;
    }
    const handle = startAutoRefresh<T>({
      load: signal => loadRef.current(signal),
      apply: value => applyRef.current(value),
      intervalMs,
      onSnapshot: next => setSync(next),
    });
    handleRef.current = handle;
    return () => {
      handle.stop();
      if (handleRef.current === handle) handleRef.current = null;
    };
    // Las dependencias las define quien llama (filtros, sucursal, etc.).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps]);

  const refresh = useCallback(() => handleRef.current?.refresh() ?? Promise.resolve(), []);

  return { refresh, sync };
}
