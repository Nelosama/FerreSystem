import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { startBarcodeCamera } from '../utils/barcodeScanner';
import './BarcodeScanner.css';

export const BarcodeScanner: React.FC<{
  onCode: (code: string) => void; disabled?: boolean; onManual?: () => void;
}> = ({ onCode, disabled, onManual }) => {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [success, setSuccess] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [activeDeviceId, setActiveDeviceId] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stopSession = useRef<(() => void) | undefined>(undefined);
  const callback = useRef(onCode);
  callback.current = onCode;
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open || disabled || !video.current) return;
    const preview = video.current;
    const stop = startBarcodeCamera(preview, {
      locale, deviceId,
      onCameras: (devices, active) => { setCameras(devices); setActiveDeviceId(active); },
      onReady: () => setStatus(t('scanner.ready')),
      onError: message => { setError(message); setOpen(false); setStatus(''); },
      onCode: code => { setOpen(false); setSuccess(true); setStatus(t('scanner.read', { code })); callback.current(code); },
    });
    stopSession.current = stop;
    const close = () => { stop(); setOpen(false); setStatus(''); };
    const interrupt = () => { close(); setStatus(t('scanner.interrupted')); };
    const visibility = () => { if (document.hidden) interrupt(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    // Collapsing the inventory's <details> hides the preview without unmounting it.
    const details = preview.closest('details');
    const toggle = () => { if (details && !details.open) close(); };
    window.addEventListener('pagehide', interrupt);
    window.addEventListener('keydown', escape);
    document.addEventListener('visibilitychange', visibility);
    details?.addEventListener('toggle', toggle);
    return () => {
      stop(); stopSession.current = undefined;
      window.removeEventListener('pagehide', interrupt);
      window.removeEventListener('keydown', escape);
      document.removeEventListener('visibilitychange', visibility);
      details?.removeEventListener('toggle', toggle);
    };
  }, [open, disabled, t, locale, deviceId]);
  return <div className="barcode-scanner">
    <div className="barcode-scanner__actions">
      <button type="button" className="btn btn-secondary" disabled={disabled && !open} onClick={() => {
        if (open) stopSession.current?.();
        else { setDeviceId(''); setCameras([]); setActiveDeviceId(''); }
        setError(''); setSuccess(false); setStatus(open ? '' : t('scanner.starting')); setOpen(value => !value);
      }}>{open ? t('scanner.stop') : t('scanner.start')}</button>
      {(open || error) && <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => {
        stopSession.current?.(); setOpen(false); setError(''); setSuccess(false); setStatus(t('scanner.manual_hint')); onManual?.();
      }}>{t('scanner.manual')}</button>}
    </div>
    {open && cameras.length > 1 && <label className="barcode-scanner__camera">
      {t('scanner.camera')}
      <select aria-label={t('scanner.camera')} value={deviceId || activeDeviceId} onChange={event => {
        stopSession.current?.(); setError(''); setSuccess(false); setStatus(t('scanner.starting')); setDeviceId(event.target.value);
      }}>
        {!activeDeviceId && !deviceId && <option value="">{t('scanner.default_camera')}</option>}
        {cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>
          {camera.label || t('scanner.camera_number', { number: index + 1 })}
        </option>)}
      </select>
    </label>}
    {open && <div className="barcode-scanner__preview">
      <video ref={video} autoPlay muted playsInline aria-label={t('scanner.preview')} />
      <div className="barcode-scanner__guide" aria-hidden="true" />
      <span className="barcode-scanner__indicator" aria-hidden="true" />
    </div>}
    {status && <p role="status" className={success ? 'barcode-scanner__success' : undefined}>{status}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
};
