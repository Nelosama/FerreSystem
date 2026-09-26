import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { Rubro } from '../types';
import { RUBROS_CONFIG_LOCALIZED, RubroConfig } from '../config/rubros';

export function useRubroConfig(): RubroConfig {
  const { tenant } = useTenant();
  const { locale } = useI18n();

  const rubroKey = (tenant.rubro || Rubro.FERRETERIA) as Rubro;
  const locConfig = RUBROS_CONFIG_LOCALIZED[rubroKey] || RUBROS_CONFIG_LOCALIZED[Rubro.FERRETERIA];

  const lang = (locale === 'en') ? 'en' : 'es';

  return {
    nombreCatalogo: locConfig.nombreCatalogo[lang] || locConfig.nombreCatalogo.es,
    categoriasDefault: locConfig.categoriasDefault.map((c) => c[lang] || c.es),
    unidadesMedida: locConfig.unidadesMedida.map((u) => u[lang] || u.es),
    mensajeStockBajo: locConfig.mensajeStockBajo[lang] || locConfig.mensajeStockBajo.es,
    activarVencimientos: locConfig.activarVencimientos,
    activarGarantiaSerie: locConfig.activarGarantiaSerie,
  };
}
