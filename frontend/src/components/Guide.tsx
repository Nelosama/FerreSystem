import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTenant } from "../context/TenantContext";
import { useI18n } from "../context/I18nContext";
import { api } from "../utils/api";
import { guideSteps } from "../utils/guide";
import "./Guide.css";

type Progress = { status?: string; step?: string };
export function Guide() {
  const { user, tenant, isImpersonating, authStatus } = useTenant();
  const allowed =
    !isImpersonating &&
    authStatus === "ready" &&
    (user?.rol === "SUPERADMIN" || tenant.modoGuia === true);
  return allowed ? <GuideSession key={`${user?.id}:${tenant.id}`} /> : null;
}
function GuideSession() {
  const { user, tenant } = useTenant();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [progress, setProgress] = React.useState<Progress | null>(null);
  const [enabled, setEnabled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [help, setHelp] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const alive = React.useRef(false);
  const steps = guideSteps(user, tenant);
  const index = Math.max(
    0,
    steps.findIndex((step) => step.key === progress?.step),
  );
  const current = steps[index];
  React.useEffect(() => {
    alive.current = true;
    api
      .get("/auth/guia")
      .then(({ data }) => {
        if (alive.current) {
          setEnabled(data.enabled === true);
          setProgress(data.progress || {});
        }
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);
  const targetSelector = current?.target;
  const targetRoute = current?.route;
  const targetKey = current?.key;
  React.useEffect(() => {
    if (!enabled || !open || !targetSelector || pathname !== targetRoute)
      return;
    const timer = window.setTimeout(() => {
      // Visible target only; mobile layouts fall back to page context. Never click an operational control.
      const targets = Array.from(document.querySelectorAll(targetSelector));
      const target =
        targets.find((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight &&
            rect.right > 0 &&
            rect.left < window.innerWidth
          );
        }) ||
        document.querySelector("main") ||
        document.querySelector("[data-guide-content]");
      if (target && target.getBoundingClientRect().width > 0)
        target.classList.add("guide-highlight");
    }, 150);
    return () => {
      window.clearTimeout(timer);
      document
        .querySelectorAll(".guide-highlight")
        .forEach((node) => node.classList.remove("guide-highlight"));
    };
  }, [enabled, open, targetKey, targetSelector, targetRoute, pathname]);
  const save = async (status: string, key = current?.key || "") => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await api.put("/auth/guia", { status, step: key });
      if (!alive.current) return false;
      setProgress({ status, step: key });
      return true;
    } catch {
      if (alive.current) setError(t("guide.saveError"));
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const start = async (restart = false) => {
    const next = restart ? steps[0] : current;
    if (next && (await save("active", next.key))) {
      setOpen(true);
      setHelp(false);
      navigate(next.route);
    }
  };
  const move = async (nextIndex: number) => {
    const next = steps[nextIndex];
    if (next && (await save("active", next.key))) navigate(next.route);
  };
  if (!enabled || !steps.length || !progress) return null;
  return (
    <aside className="guide" aria-label={t("guide.title")}>
      {!open && (
        <button
          className="btn btn-secondary"
          onClick={() => setHelp(!help)}
          aria-expanded={help}
        >
          {t("guide.help")}
        </button>
      )}
      {!open && (!progress.status || progress.status === "pending" || help) && (
        <div className="guide-card">
          <strong>{t(help ? "guide.title" : "guide.invite")}</strong>
          <p>{t("guide.intro")}</p>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void start()}
          >
            {t("guide.start")}
          </button>{" "}
          {help && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void start(true)}
            >
              {t("guide.restart")}
            </button>
          )}{" "}
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={async () => {
              if (await save("dismissed")) setHelp(false);
            }}
          >
            {t("guide.later")}
          </button>
          {help && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void save("completed")}
            >
              {t("guide.complete")}
            </button>
          )}
        </div>
      )}
      {open && current && (
        <section className="guide-card" aria-label={t("guide.title")}>
          <strong>
            {t("guide.title")} · {index + 1}/{steps.length}
          </strong>
          <p aria-live="polite">{t("guide.steps." + current.textKey)}</p>
          {pathname !== current.route && (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => navigate(current.route)}
            >
              {t("guide.show")}
            </button>
          )}
          <div className="guide-actions">
            <button
              className="btn btn-secondary"
              disabled={busy || index === 0}
              onClick={() => void move(index - 1)}
            >
              {t("guide.back")}
            </button>
            {index < steps.length - 1 ? (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void move(index + 1)}
              >
                {t("guide.next")}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={async () => {
                  if (await save("completed")) setOpen(false);
                }}
              >
                {t("guide.complete")}
              </button>
            )}
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={async () => {
                if (await save("active")) setOpen(false);
              }}
            >
              {t("guide.exit")}
            </button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="guide-card">
          {error}
        </p>
      )}
    </aside>
  );
}
