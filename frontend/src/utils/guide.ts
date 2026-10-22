import { availableTasks } from "./taskNavigation";
import type { TenantInfo, UserInfo } from "../types";
export interface GuideStep {
  key: string;
  route: string;
  target: string;
  textKey: string;
}
const step = (
  key: string,
  route: string,
  target = "main",
  textKey = key,
): GuideStep => ({ key, route, target, textKey });
const sales = [
  step("search", "/pos", ".ferre-pos input[placeholder]"),
  step("cart", "/pos", ".ferre-pos-grid > .industrial-card:last-child"),
  step("total", "/pos", ".ferre-pos-grid > .industrial-card:last-child"),
  step(
    "payment",
    "/pos",
    ".ferre-pos-grid > .industrial-card:last-child button.btn-primary",
  ),
  step("receipt", "/pos", "main"),
];
const plans: Record<string, string[]> = {
  ADMIN: [
    "dashboard",
    "inventario",
    "levantamiento",
    "clientes",
    "ordenes_compra",
    "reportes",
    "arqueo_caja",
    "usuarios",
  ],
  BODEGUERO: [
    "dashboard",
    "inventario",
    "levantamiento",
    "ordenes_compra",
    "entregas",
  ],
  VENDEDOR: ["pos", "cotizaciones", "arqueo_caja", "dashboard"],
};
export function guideSteps(
  user: UserInfo | null,
  tenant: TenantInfo,
): GuideStep[] {
  if (!user) return [];
  if (user.rol === "SUPERADMIN")
    return ["businesses", "modules", "branding", "subscriptions", "status"].map(
      (key) => step(key, "/admin", '[data-guide="' + key + '"]'),
    );
  const tasks = availableTasks(user, tenant);
  if (user.rol === "CAJERO")
    return tasks.some((item) => item.key === "pos")
      ? sales
      : tasks
          .filter((item) =>
            ["dashboard", "arqueo_caja", "entregas"].includes(item.key),
          )
          .map((item) => step(item.key, item.route));
  if (user.rol === "ADMIN") {
    const keys = [
      "dashboard",
      "inventario",
      "clientes",
      "ordenes_compra",
      "reportes",
      "arqueo_caja",
      "usuarios",
    ];
    const selected = keys.flatMap((key) => {
      const task = tasks.find((item) => item.key === key);
      return task ? [step(key, task.route)] : [];
    });
    if (
      selected.some((item) => item.key === "clientes") &&
      selected.some((item) => item.key === "ordenes_compra")
    ) {
      selected.find((item) => item.key === "clientes")!.textKey = "contacts";
      return selected.filter((item) => item.key !== "ordenes_compra");
    }
    return selected;
  }
  return (plans[user.rol] || [])
    .flatMap((key) => {
      const task = tasks.find((item) => item.key === key);
      if (!task) return [];
      // Guidance for product registration and other writes only when individually authorized.
      if (
        key === "inventario" &&
        user.rol !== "ADMIN" &&
        user.permisosConfigurados &&
        !user.permisos?.includes("inventario.ver")
      )
        return [];
      return [
        step(
          key,
          task.route,
          "main",
          key === "cotizaciones" &&
            user.permisosConfigurados &&
            !user.permisos?.includes("cotizaciones.crear")
            ? "quoteRead"
            : key === "inventario" &&
                user.rol !== "ADMIN" &&
                user.permisosConfigurados &&
                !user.permisos?.includes("inventario.editar")
              ? "inventoryRead"
              : key,
        ),
      ];
    })
    .slice(0, 6);
}
