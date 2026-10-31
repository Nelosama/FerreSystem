import {
  CATALOGO_MODULOS,
  MODULE_DEPENDENCIES,
  PENDING_MODULES,
} from "../config/modulesCatalog";
import { useI18n } from "../context/I18nContext";
export function ModuleControls({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const label = (key: string) =>
    t(CATALOGO_MODULOS.find((item) => item.key === key)?.labelKey || key);
  const groups = [
    ["sales", ["OPERACION"]],
    ["stock", ["INVENTARIO"]],
    ["management", ["CLIENTES", "GESTION", "CONFIGURACION"]],
    ["finance", ["ANALISIS"]],
  ] as const;
  const conflicts = Object.entries(MODULE_DEPENDENCIES).flatMap(
    ([key, deps]) =>
      !PENDING_MODULES.has(key) && value.includes(key)
        ? deps
            .filter((dep) => !value.includes(dep))
            .map((dep) => `${label(key)} → ${label(dep)}`)
        : [],
  );
  return (
    <div>
      <p>{t("modules.impact")}</p>
      {conflicts.length > 0 && (
        <p role="alert">
          {t("modules.dependencies")}: {conflicts.join(", ")}
        </p>
      )}
      {groups.map(([group, categories]) => (
        <fieldset
          key={group}
          disabled={disabled}
          style={{ margin: "12px 0", padding: 12, minWidth: 0 }}
        >
          <legend>{t("modules.groups." + group)}</legend>
          {CATALOGO_MODULOS.filter((item) =>
            (categories as readonly string[]).includes(item.categoria) && !PENDING_MODULES.has(item.key),
          ).map((item) => (
            <label
              key={item.key}
              className="negocio-module"
              style={{ display: "block", marginBottom: 12 }}
            >
              <input
                type="checkbox"
                checked={value.includes(item.key)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...value, item.key]
                      : value.filter((key) => key !== item.key),
                  )
                }
              />{" "}
              {label(item.key)} ·{" "}
              {t(value.includes(item.key) ? "guide.enabled" : "guide.disabled")}
              <small style={{ display: "block" }}>
                {t("moduleDescriptions." + item.key)}
              </small>
              {MODULE_DEPENDENCIES[item.key] && (
                <small style={{ display: "block" }}>
                  {t("modules.dependencies")}:{" "}
                  {MODULE_DEPENDENCIES[item.key].map(label).join(", ")}
                </small>
              )}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
