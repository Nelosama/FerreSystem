export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] as const;
export type FrameDecoder = (video: HTMLVideoElement) => Promise<string | null>;
interface NativeDetector { detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]> }
interface NativeConstructor {
  new(options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

// Feature detection, never user-agent sniffing. Only load ZXing when needed.
export async function createBarcodeDecoder(): Promise<FrameDecoder> {
  const Native = (window as unknown as { BarcodeDetector?: NativeConstructor }).BarcodeDetector;
  let fallback: FrameDecoder | undefined;
  const software = async (video: HTMLVideoElement) => {
    fallback ??= (await import('./zxingDecoder')).createZxingDecoder();
    return fallback(video);
  };
  async function nativeDecoder(): Promise<FrameDecoder | null> {
    if (!Native || typeof Native.getSupportedFormats !== 'function') return null;
    const supported = await Native.getSupportedFormats();
    if (!SCAN_FORMATS.every(format => supported.includes(format))) return null;
    const detector = new Native({ formats: [...SCAN_FORMATS] });
    let failed = false;
    return async video => {
      if (!failed) {
        try { return (await detector.detect(video))[0]?.rawValue ?? null; }
        catch { failed = true; }
      }
      return software(video);
    };
  }
  try { const native = await nativeDecoder(); if (native) return native; } catch { /* Use local decoder. */ }
  fallback = (await import('./zxingDecoder')).createZxingDecoder();
  return software;
}

export function cameraError(error: unknown, locale: 'es' | 'en' = 'es'): string {
  const name = error && typeof error === 'object' && 'name' in error && typeof error.name === 'string' ? error.name : '';
  // DOMException y errores de otro realm no siempre son instanceof Error.
  const en = locale === 'en';
  if (name === 'NotAllowedError' || name === 'SecurityError') return en
    ? 'Camera permission denied. Enable it for this site in Safari or enter the code manually.'
    : 'Permiso de cámara denegado. Habilítelo para este sitio en Safari o introduzca el código manualmente.';
  if (name === 'NotReadableError' || name === 'AbortError') return en
    ? 'The camera is busy or could not start. Close other applications and retry.'
    : 'La cámara está ocupada o no pudo iniciarse. Cierre otras aplicaciones y reintente.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return en
    ? 'No camera found. You can enter the code manually.'
    : 'No se encontró una cámara disponible. Puede introducir el código manualmente.';
  if (name === 'TimeoutError') return en
    ? 'The camera or scanner did not respond in time. Retry or enter the code manually.'
    : 'La cámara o el escáner no respondió a tiempo. Reintente o introduzca el código manualmente.';
  if (name === 'CameraInterruptedError') return en
    ? 'The camera was interrupted. Reopen the scanner or enter the code manually.'
    : 'Se interrumpió la cámara. Vuelva a abrir el escáner o introduzca el código manualmente.';
  if (name === 'ScannerSetupError' && error instanceof Error) return error.message;
  return en ? 'Could not start the scanner. Retry or enter the code manually.'
    : 'No se pudo iniciar el escáner. Reintente o introduzca el código manualmente.';
}

// getUserMedia cannot be aborted. Reuse an unresolved permission request on reopen,
// and let only its latest consumer own the eventual stream (or release it).
const pendingCameras = new WeakMap<MediaDevices, { promise: Promise<MediaStream>; owner: symbol; deviceId?: string }>();
function acquireCamera(mediaDevices: MediaDevices, stopped: () => boolean, onPending: (retire: () => void) => void, deviceId?: string): Promise<MediaStream | undefined> {
  const owner = Symbol();
  let pending = pendingCameras.get(mediaDevices);
  if (!pending || pending.deviceId !== deviceId) {
    const promise = mediaDevices.getUserMedia({
      audio: false,
      video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
    });
    pending = { promise, owner, deviceId };
    pendingCameras.set(mediaDevices, pending);
    const clear = () => { if (pendingCameras.get(mediaDevices) === pending) pendingCameras.delete(mediaDevices); };
    // Both handlers settle successfully: no unhandled rejection from finally().
    void promise.then(clear, clear);
  }
  pending.owner = owner;
  const request = pending;
  onPending(() => {
    if (request.owner === owner && pendingCameras.get(mediaDevices) === request) pendingCameras.delete(mediaDevices);
  });
  return request.promise.then(stream => {
    if (request.owner !== owner) return undefined;
    if (stopped()) { stream.getTracks().forEach(track => track.stop()); return undefined; }
    return stream;
  });
}

function configureAutofocus(track?: MediaStreamTrack) {
  // Safari may omit focusMode; unsupported optional controls must not stop scanning.
  try {
    const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;
    if (capabilities?.focusMode?.includes('continuous')) {
      void track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
    }
  } catch { /* Keep the camera's default focus if capabilities are unavailable. */ }
}

// Owns one activation: one accepted reading, one stream, one cancellable loop.
export function startBarcodeCamera(video: HTMLVideoElement, callbacks: {
  onCode(code: string): void; onError(message: string): void; onReady(): void; locale?: 'es' | 'en';
  deviceId?: string; onCameras?(cameras: MediaDeviceInfo[], activeDeviceId: string): void;
}, dependencies = {
  secure: window.isSecureContext,
  mediaDevices: navigator.mediaDevices,
  createDecoder: createBarcodeDecoder,
}) {
  let stopped = false;
  let stream: MediaStream | undefined;
  let retirePending: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frameTimer: ReturnType<typeof setTimeout> | undefined;
  const cancellations = new Set<() => void>();
  const listeners: (() => void)[] = [];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer); clearTimeout(frameTimer);
    listeners.forEach(remove => remove());
    cancellations.forEach(cancel => cancel());
    cancellations.clear();
    stream?.getTracks().forEach(track => track.stop());
    if (stream && video.srcObject === stream) { video.pause(); video.srcObject = null; }
  };
  const fail = (error: unknown) => {
    if (stopped) return;
    // After a timeout, a retry must be able to request a fresh camera. The retired
    // request still releases its stream if the browser eventually resolves it.
    if (error && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError') retirePending?.();
    stop(); callbacks.onError(cameraError(error, callbacks.locale));
  };
  const waitFor = <T,>(promise: Promise<T>, milliseconds: number): Promise<T> => new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timeout); cancellations.delete(cancel); reject({ name: 'AbortError' }); };
    const timeout = setTimeout(() => { cancellations.delete(cancel); reject({ name: 'TimeoutError' }); }, milliseconds);
    cancellations.add(cancel);
    void promise.then(value => {
      clearTimeout(timeout); cancellations.delete(cancel); resolve(value);
    }, error => { clearTimeout(timeout); cancellations.delete(cancel); reject(error); });
  });
  const interrupted = () => fail({ name: 'CameraInterruptedError' });
  const watchFrames = () => {
    clearTimeout(frameTimer);
    frameTimer = setTimeout(interrupted, 15000);
  };
  void (async () => {
    try {
      if (!dependencies.secure) throw Object.assign(new Error(callbacks.locale === 'en' ? 'The camera requires HTTPS. Open Jowa System using a secure address or enter the code manually.' : 'La cámara requiere HTTPS. Abra Jowa System mediante una dirección segura o introduzca el código manualmente.'), { name: 'ScannerSetupError' });
      if (!dependencies.mediaDevices?.getUserMedia) throw Object.assign(new Error(callbacks.locale === 'en' ? 'This browser does not support camera access. Use updated Safari or enter the code manually.' : 'Este navegador no permite acceder a la cámara. Use Safari actualizado o introduzca el código manualmente.'), { name: 'ScannerSetupError' });
      await waitFor(acquireCamera(dependencies.mediaDevices, () => stopped, retire => { retirePending = retire; }, callbacks.deviceId).then(acquired => {
        if (acquired && stopped) acquired.getTracks().forEach(track => track.stop());
        else stream = acquired;
      }), 30000);
      if (!stream || stopped) return;
      for (const track of stream.getTracks()) {
        track.addEventListener?.('ended', interrupted);
        listeners.push(() => track.removeEventListener?.('ended', interrupted));
      }
      video.addEventListener?.('error', interrupted);
      listeners.push(() => video.removeEventListener?.('error', interrupted));
      configureAutofocus(stream.getVideoTracks?.()[0]);
      video.muted = true; video.playsInline = true; video.srcObject = stream;
      await waitFor(video.play(), 15000);
      if (stopped) return;
      const decode = await waitFor(dependencies.createDecoder(), 15000);
      if (stopped) return;
      callbacks.onReady();
      // Enumerate only after permission. Unsupported/rejected enumeration must
      // leave the working camera usable; a late result cannot revive a session.
      if (callbacks.onCameras && dependencies.mediaDevices.enumerateDevices) {
        void Promise.resolve().then(() => dependencies.mediaDevices.enumerateDevices()).then(devices => {
          if (!stopped) callbacks.onCameras?.(
            devices.filter(device => device.kind === 'videoinput' && device.deviceId),
            stream?.getVideoTracks?.()[0]?.getSettings?.().deviceId || '',
          );
        }).catch(() => undefined);
      }
      if (stopped) return;
      let previousTime = -1;
      watchFrames();
      const scan = async () => {
        if (stopped) return;
        try {
          if (video.readyState >= 2) {
            // A live track can still produce a frozen/black preview after interruption.
            if (!Number.isFinite(video.currentTime) || video.currentTime !== previousTime) {
              previousTime = video.currentTime;
              watchFrames();
            }
            const code = await waitFor(decode(video), 5000);
            if (stopped) return;
            if (code?.trim()) { stop(); callbacks.onCode(code.trim()); return; }
          }
          if (!stopped) timer = setTimeout(() => void scan(), 250);
        } catch (error) { fail(error); }
      };
      void scan();
    } catch (error) { fail(error); }
  })();
  return stop;
}
