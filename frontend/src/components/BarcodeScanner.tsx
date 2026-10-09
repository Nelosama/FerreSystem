import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { startBarcodeCamera } from '../utils/barcodeScanner';

export const BarcodeScanner: React.FC<{ onCode: (code: string) => void; disabled?: boolean }> = ({ onCode, disabled }) => {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onCode);
  callback.current = onCode;
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open || disabled || !video.current) return;
    const stop = startBarcodeCamera(video.current, {
      locale,
      onReady: () => setStatus(t('scanner.ready')),
      onError: message => { setError(message); setOpen(false); setStatus(''); },
      onCode: code => { setOpen(false); setStatus(t('scanner.read', { code })); callback.current(code); },
    });
    const close = () => { stop(); setOpen(false); setStatus(''); };
    const visibility = () => { if (document.hidden) close(); };
    window.addEventListener('pagehide', close);
    document.addEventListener('visibilitychange', visibility);
    return () => { stop(); window.removeEventListener('pagehide', close); document.removeEventListener('visibilitychange', visibility); };
  }, [open, disabled, t, locale]);
  return <div>
    <button type="button" className="btn btn-secondary" disabled={disabled && !open} onClick={() => {
      setError(''); setStatus(open ? '' : t('scanner.starting')); setOpen(value => !value);
    }}>{open ? t('scanner.stop') : t('scanner.start')}</button>
    {open && <video ref={video} autoPlay muted playsInline aria-label={t('scanner.preview')} style={{ display: 'block', width: '100%', maxWidth: 480, maxHeight: 320 }} />}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
};
