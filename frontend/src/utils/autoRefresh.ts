import { ZONA_HORARIA_NEGOCIO } from './format';

// Sincronización automática de consultas de solo lectura. Reemplaza los botones «Actualizar».
// Reglas: carga al iniciar, refresco periódico, al volver a la pestaña, al recuperar la red;
// una sola petición en vuelo por consulta (sin duplicados); las respuestas obsoletas se descartan;
// al detener se cancela la petición pendiente. Nunca ejecuta operaciones de escritura: `load` debe
// ser una lectura. `apply` debe fusionar datos sin reiniciar formularios ni filtros del usuario.
// El entorno (red, visibilidad, temporizador) se inyecta para poder probarlo sin navegador.

export type SyncPhase = 'idle' | 'loading' | 'ok' | 'error' | 'offline';

export interface SyncSnapshot {
  phase: SyncPhase;
  lastSync: Date | null;
}

export interface AutoRefreshEnv {
  online(): boolean;
  visible(): boolean;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
  listen(event: 'online' | 'offline' | 'visible', callback: () => void): () => void;
}

export interface AutoRefreshOptions<T> {
  load: (signal: AbortSignal) => Promise<T>;
  apply: (value: T) => void;
  intervalMs: number;
  onSnapshot?: (snapshot: SyncSnapshot) => void;
  env?: AutoRefreshEnv;
  now?: () => Date;
}

export interface AutoRefreshHandle {
  refresh(): Promise<void>;
  stop(): void;
}

export const browserAutoRefreshEnv = (): AutoRefreshEnv => ({
  online: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  visible: () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'),
  setTimer: (callback, ms) => window.setInterval(callback, ms),
  clearTimer: (id) => window.clearInterval(id as number),
  listen: (event, callback) => {
    if (event === 'visible') {
      const handler = () => { if (document.visibilityState !== 'hidden') callback(); };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    }
    window.addEventListener(event, callback);
    return () => window.removeEventListener(event, callback);
  },
});

export function startAutoRefresh<T>(options: AutoRefreshOptions<T>): AutoRefreshHandle {
  const env = options.env ?? browserAutoRefreshEnv();
  const now = options.now ?? (() => new Date());
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let lastSync: Date | null = null;

  const emit = (phase: SyncPhase) => {
    options.onSnapshot?.({ phase, lastSync });
  };

  const refresh = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    // Una sola petición a la vez: si ya hay una en vuelo, se reutiliza en lugar de duplicarla.
    if (inFlight) return inFlight;
    if (!env.online()) {
      emit('offline');
      return Promise.resolve();
    }
    // En segundo plano no se consulta; al volver a la pestaña se dispara un refresco.
    if (!env.visible()) return Promise.resolve();

    const current = new AbortController();
    controller = current;
    emit('loading');
    const request = (async () => {
      try {
        const value = await options.load(current.signal);
        if (stopped || current.signal.aborted) return;
        options.apply(value);
        lastSync = now();
        emit('ok');
      } catch {
        if (stopped || current.signal.aborted) return;
        emit(env.online() ? 'error' : 'offline');
      } finally {
        // Solo libera la petición si sigue siendo la vigente: una cancelada no bloquea la siguiente.
        if (controller === current) {
          controller = null;
          inFlight = null;
        }
      }
    })();
    inFlight = request;
    return request;
  };

  const timer = env.setTimer(() => { void refresh(); }, options.intervalMs);
  const unlisten = [
    env.listen('visible', () => { void refresh(); }),
    env.listen('online', () => { void refresh(); }),
    env.listen('offline', () => {
      // Se cancela la petición en vuelo: su respuesta ya no es fiable sin red.
      controller?.abort();
      controller = null;
      inFlight = null;
      emit('offline');
    }),
  ];

  void refresh();

  return {
    refresh,
    stop() {
      if (stopped) return;
      stopped = true;
      controller?.abort();
      controller = null;
      inFlight = null;
      env.clearTimer(timer);
      unlisten.forEach(off => off());
    },
  };
}

// Hora local del negocio en formato corto (HH:mm), para el indicador de sincronización.
export function formatHoraSincronizacion(date: Date, zona: string = ZONA_HORARIA_NEGOCIO): string {
  return date.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zona });
}
