import type { Page } from '@playwright/test';

// Browser lifecycle tests with simulated media and native detector; no physical camera.
export async function installScannerCamera(page: Page, software = false) {
  await page.addInitScript(({ software }) => {
    const state = {
      requests: 0, stops: 0, detections: 0, denied: false, pending: false,
      code: '', constraints: [] as MediaStreamConstraints[], tracks: [] as EventTarget[],
      resolveCamera: (() => {}) as () => void,
      endTrack: () => state.tracks.at(-1)?.dispatchEvent(new Event('ended')),
    };
    Object.assign(window, { scannerCamera: state });
    const getUserMedia = (constraints: MediaStreamConstraints) => {
      state.requests++; state.constraints.push(constraints);
      if (state.denied) return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
      const track = Object.assign(new EventTarget(), { stop: () => { state.stops++; } });
      state.tracks.push(track);
      const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
      if (state.pending) return new Promise(resolve => { state.resolveCamera = () => resolve(stream); });
      return Promise.resolve(stream);
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const streams = new WeakMap<HTMLMediaElement, unknown>();
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, get() { return streams.get(this) || null; }, set(value) { streams.set(this, value); } });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => {};
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { configurable: true, get: () => performance.now() / 1000 });
    Object.assign(window, { BarcodeDetector: class {
      static getSupportedFormats() { return Promise.resolve(['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']); }
      detect() { state.detections++; return Promise.resolve(state.code ? [{ rawValue: state.code }] : []); }
    } });
    if (software) {
      Object.assign(window, { BarcodeDetector: undefined });
      const bits = '10100010110100111011001100100110111101001110101010110011011011001000010101110010011101000100101';
      const modules = '0'.repeat(20) + bits + '0'.repeat(20);
      const canvas = document.createElement('canvas');
      canvas.width = modules.length * 3; canvas.height = 120;
      const context = canvas.getContext('2d')!;
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'black';
      [...modules].forEach((bit, i) => { if (bit === '1') context.fillRect(i * 3, 10, 3, 100); });
      Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => canvas.width });
      Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => canvas.height });
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (source, ...args: any[]) {
        return (draw as any).call(this, source instanceof HTMLVideoElement ? canvas : source, ...args);
      };
    }
  }, { software });
}
