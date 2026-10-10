export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'code_128'] as const;
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
  if (error instanceof Error && error.message) return error.message;
  return en ? 'Could not start the scanner. Retry or enter the code manually.'
    : 'No se pudo iniciar el escáner. Reintente o introduzca el código manualmente.';
}

// Owns one activation: one accepted reading, one stream, one cancellable loop.
export function startBarcodeCamera(video: HTMLVideoElement, callbacks: {
  onCode(code: string): void; onError(message: string): void; onReady(): void; locale?: 'es' | 'en';
}, dependencies = {
  secure: window.isSecureContext,
  mediaDevices: navigator.mediaDevices,
  createDecoder: createBarcodeDecoder,
}) {
  let stopped = false;
  let stream: MediaStream | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach(track => track.stop());
    if (stream && video.srcObject === stream) { video.pause(); video.srcObject = null; }
  };
  const fail = (error: unknown) => { if (!stopped) { stop(); callbacks.onError(cameraError(error, callbacks.locale)); } };
  void (async () => {
    try {
      if (!dependencies.secure) throw new Error(callbacks.locale === 'en' ? 'The camera requires HTTPS. Open FerreSystem using a secure address or enter the code manually.' : 'La cámara requiere HTTPS. Abra FerreSystem mediante una dirección segura o introduzca el código manualmente.');
      if (!dependencies.mediaDevices?.getUserMedia) throw new Error(callbacks.locale === 'en' ? 'This browser does not support camera access. Use updated Safari or enter the code manually.' : 'Este navegador no permite acceder a la cámara. Use Safari actualizado o introduzca el código manualmente.');
      stream = await dependencies.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (stopped) { stream.getTracks().forEach(track => track.stop()); return; }
      video.muted = true; video.playsInline = true; video.srcObject = stream;
      await video.play();
      if (stopped) return;
      const decode = await dependencies.createDecoder();
      if (stopped) return;
      callbacks.onReady();
      const scan = async () => {
        if (stopped) return;
        try {
          if (video.readyState >= 2) {
            const code = await decode(video);
            if (stopped) return;
            if (code) { stop(); callbacks.onCode(code); return; }
          }
          timer = setTimeout(() => void scan(), 250);
        } catch (error) { fail(error); }
      };
      void scan();
    } catch (error) { fail(error); }
  })();
  return stop;
}
