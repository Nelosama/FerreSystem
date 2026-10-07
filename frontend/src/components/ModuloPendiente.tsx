import React from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from './TopBar';
import { useI18n } from '../context/I18nContext';
import { useTenant } from '../context/TenantContext';
import { availableTasks } from '../utils/taskNavigation';
export const ModuloPendiente: React.FC<{ nombre: string; especial?: boolean }> = ({ nombre, especial }) => {
  const { t } = useI18n();
  const { user, tenant } = useTenant();
  const titleKey = ({ APARTADOS: 'menu.layaway', 'TRANSFERENCIAS ENTRE SUCURSALES': 'menu.transfers', 'GARANTÍAS': 'menu.warranties', 'PEDIDOS ESPECIALES': 'menu.special_orders', 'LISTAS DE PRECIO': 'menu.price_lists' } as Record<string, string>)[nombre];
  const canSell = availableTasks(user, tenant).some(item => item.key === 'pos');
  return <div><TopBar title={titleKey ? t(titleKey) : nombre} subtitle={t('pending.subtitle')} /><main style={{ padding: 24 }}>
    <section className="industrial-card" style={{ padding: 24 }} aria-label={t('pending.title')}>
      <p>{t('pending.details')}</p><p>{t('pending.help')}</p>
      <p>{t(especial ? 'pending.special' : 'pending.operational')}</p>
      {especial && canSell && <Link className="btn btn-primary" to="/pos">{t('pending.pos')}</Link>}
    </section>
  </main></div>;
};
