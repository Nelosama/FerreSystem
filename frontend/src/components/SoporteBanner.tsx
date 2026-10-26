import React from 'react';
import { LogOut, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { alertas } from '../utils/alertas';

/**
 * Aviso del modo de soporte técnico (Super Admin dentro de un negocio): único lugar para salir del soporte y para
 * activar el modo de edición con su motivo auditado. Solo se pinta mientras hay una suplantación activa.
 */
export const SoporteBanner: React.FC = () => {
  const { tenant, isImpersonating, isReadOnly, enableEditMode, stopImpersonating } = useTenant();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [confirmando, setConfirmando] = React.useState(false);
  const [motivo, setMotivo] = React.useState('');

  if (!isImpersonating) return null;

  return (
    <>
      <div className="soporte-banner" role="region" aria-label={t('topbar.support', { name: tenant.nombreComercial })}>
        <div className="soporte-banner-texto">
          <ShieldAlert size={18} aria-hidden="true" />
          <span>
            {t('topbar.support', { name: tenant.nombreComercial })}
            {t(isReadOnly ? 'topbar.read_only' : 'topbar.edit_enabled')}
          </span>
        </div>
        <div className="soporte-banner-acciones">
          {isReadOnly && (
            <button type="button" onClick={() => setConfirmando(true)} className="btn btn-sm soporte-banner-editar">
              {t('topbar.activate_edit')}
            </button>
          )}
          <button type="button" onClick={() => { stopImpersonating(); navigate('/admin'); }} className="btn btn-sm soporte-banner-salir">
            <LogOut size={13} aria-hidden="true" /> {t('topbar.exit_support')}
          </button>
        </div>
      </div>

      {confirmando && (
        <div className="soporte-modal-fondo">
          <div className="industrial-card soporte-modal">
            <div className="soporte-modal-titulo">{t('topbar.confirm_edit')}</div>
            <div className="soporte-modal-ayuda">{t('topbar.confirm_help')}</div>
            <label className="soporte-modal-motivo">
              Motivo de la edición (queda en la auditoría, mínimo 10 caracteres)
              <textarea className="form-input" rows={3} maxLength={500} value={motivo} onChange={e => setMotivo(e.target.value)} />
            </label>
            <div className="soporte-modal-botones">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmando(false)}>{t('topbar.cancel')}</button>
              <button type="button" className="btn btn-primary btn-sm soporte-banner-editar" disabled={motivo.trim().length < 10}
                onClick={async () => {
                  try {
                    await enableEditMode(motivo);
                    setConfirmando(false);
                    setMotivo('');
                  } catch {
                    alertas.error(t('topbar.edit_failed'));
                  }
                }}>
                {t('topbar.confirm_activate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
