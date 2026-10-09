import React, { useEffect, useRef, useState } from 'react';
import { startBarcodeCamera } from '../utils/barcodeScanner';

export const BarcodeScanner: React.FC<{ onCode: (code: string) => void; disabled?: boolean }> = ({ onCode, disabled }) => {
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
      onReady: () => setStatus('Apunte al código y mantenga el teléfono estable.'),
      onError: message => { setError(message); setOpen(false); setStatus(''); },
      onCode: code => { setOpen(false); setStatus(`Código leído: ${code}`); callback.current(code); },
    });
    const close = () => { stop(); setOpen(false); setStatus(''); };
    const visibility = () => { if (document.hidden) close(); };
    window.addEventListener('pagehide', close);
    document.addEventListener('visibilitychange', visibility);
    return () => { stop(); window.removeEventListener('pagehide', close); document.removeEventListener('visibilitychange', visibility); };
  }, [open, disabled]);
  return <div>
    <button type="button" className="btn btn-secondary" disabled={disabled && !open} onClick={() => {
      setError(''); setStatus(open ? '' : 'Iniciando cámara…'); setOpen(value => !value);
    }}>{open ? 'Detener escáner' : 'Leer código con cámara'}</button>
    {open && <video ref={video} autoPlay muted playsInline aria-label="Vista previa de la cámara" style={{ display: 'block', width: '100%', maxWidth: 480, maxHeight: 320 }} />}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
};
