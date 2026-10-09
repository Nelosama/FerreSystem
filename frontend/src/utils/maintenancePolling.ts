export function startMaintenancePolling<T>(
  get: (signal: AbortSignal) => Promise<T>, receive: (value: T) => void, failed: () => void,
) {
  let active = true;
  let pending: AbortController | undefined;
  const refresh = async () => {
    if (!active || pending || document.visibilityState === 'hidden' || !navigator.onLine) return;
    const controller = new AbortController(); pending = controller;
    try { const result = await get(controller.signal); if (active && !controller.signal.aborted) receive(result); }
    catch { if (active && !controller.signal.aborted) failed(); }
    finally { if (pending === controller) pending = undefined; }
  };
  const offline = () => { pending?.abort(); if (active) failed(); };
  const timer = window.setInterval(refresh, 60000);
  window.addEventListener('online', refresh);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', refresh);
  if (navigator.onLine) void refresh(); else failed();
  return () => {
    active = false; pending?.abort(); window.clearInterval(timer);
    window.removeEventListener('online', refresh); window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', refresh);
  };
}
