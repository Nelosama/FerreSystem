# Seguimiento vigente — 2026-10-31 (continuidad tras agotarse Codex)

Base comprobada: `main` `89369e2d69401387fa19a53e39a09abb7a60e05b` (merge de #227). Sustituye la sección del 2026-10-30 que sigue debajo, que queda como histórica.

**Recuperación de Codex.** El contenedor de esta sesión es un clon nuevo: no hay cambios sin commit, `stash`, worktrees ni ramas `codex/*` de la sesión agotada; lo que exista solo en esa sesión no es accesible y no se reconstruye. Codex publica con la identidad Git del dueño («Daniel Castillo»). Su último trabajo publicado está en #227: diagnóstico temporal del E2E de logout (`5c535f0d`, `9b0bb48b`), retirada del workflow temporal (`ec69410a`) y espera del login renderizado antes de `goBack` (`987515f6`, sin relajar aserciones). Ese head tenía los tres checks en success; no quedó trabajo parcial.

| PR | Estado verificado en GitHub | Head / merge |
|---|---|---|
| #225 Auditoría | Fusionado 2026-10-31 02:39Z | head `d48d9959`, merge `07243c20` |
| #226 Comisiones excluido | Fusionado 2026-10-31 00:30Z | merge `46f7db7d` |
| #227 Matriz fiscal | **Fusionado en esta sesión** tras revisión, CI verde del head y sin conflictos | head `987515f6`, merge `89369e2d` |
| #228 Infraestructura | Fusionado 2026-10-31 02:38Z | head `43c7a1a9`, merge `1422d467` |
| #229 Seguimiento | Este documento; actualizado con `main` `89369e2d` por merge normal | ver PR |
| #230 Idempotencia | Fusionado 2026-10-31 01:51Z | head `f004abde`, merge `4faf3800` |
| #231 Contingencia, seguridad, UX | Fusionado 2026-10-31 02:09Z | head `92412062`, merge `b89f5e6b` |

`main` `07243c20` tenía ambos workflows en success (runs 41160988683 y 41160988785). Las ramas fusionadas ya fueron retiradas del remoto; ningún PR cerrado reciente contiene commits sin integrar.

**Trabajo nuevo** en `claude/focused-hawking-52oiqz` (PR propio, sin cambios de producto ni esquema):

- La rama no estaba en el bloqueo de Vercel: se añadió a `vercel.json`, `vercel-ignore.sh` y su prueba antes del primer push (`ca7d2fc4`, 38/38).
- ARN-05 resuelto: las dos omisiones desactualizadas del piloto real (entrega parcial por línea y autorización del datáfono) son pruebas reales navegador→API→PostgreSQL. La primera ejecución detectó que la API responde 409 (`ConflictException`) y no 400; se corrigió la expectativa de la prueba, no el producto.

**Pruebas ejecutadas (local, PostgreSQL 16 temporal, datos sintéticos):** backend 835/835, scripts 52/52, Python 11/11, frontend 585/585, builds y lint sin errores; integración PostgreSQL completa 73 archivos / 1261 aprobadas / 2 fallos esperados (7 fallos iniciales de entorno por la envoltura local de `pg_dump`, repetidos en verde tras corregirla); piloto real completo 186 aprobadas / 0 fallidas / 2 omitidas. El CI de cada PR se consulta por su propio SHA.

**GO/NO-GO: NO-GO** para producción con datos reales. Persisten decisiones fiscales D1–D11, C-01/C-02/C-04 y AUD-FIS-01 (#227 solo las enumera); Render con health check vacío y migración en el arranque; respaldo/restauración y RPO/RTO reales; SMTP real; dispositivos físicos; aceptación del cliente. Comisiones sigue excluido hasta que exista especificación aprobada.

Sin despliegues, sin bases reales, sin force push y sin eliminar ramas con trabajo pendiente.

---

# Seguimiento vigente — 2026-10-30 (America/Tegucigalpa)

Base comprobada: `main` `46f7db7d74c04ce9c9fd3dbbe6e0eaa9e8810412`. #226 está fusionado; Comisiones excluido, sin implementar reglas ni cálculos. Ya no está pendiente decidir su merge. #225 ya incorporó esa base y sustituyó el E2E fallido de Comisiones por una prueba positiva de exclusión.

| PR | Estado del trabajo |
|---|---|
| #225 | Auditoría histórica y pruebas; conciliación de Comisiones con #226. Sigue en borrador. |
| #227 | Matriz de decisiones fiscales; abierto, no borrador. No contiene aprobación del contador. |
| #228 | Auditoría de infraestructura y checklist; abierto, no borrador. Hosting, respaldo y hardware reales pendientes. |
| #229 | Este seguimiento; abierto en borrador. |
| #230 | Corrección de idempotencia monetaria en ventas/caja y regresiones PostgreSQL. Abierto, sin integrar. |
| #231 | Relevo de pestaña de contingencia, tratamiento 5xx y aislamiento por rol. Abierto, sin integrar. |

Esta ronda incorpora `origin/main` en las ramas existentes mediante merge cuando falta; #225 ya contenía esa base. No integra #230/#231 entre sí ni atribuye a main sus cambios. CI y validación se consultan por el head remoto de cada PR; los verdes históricos de abajo no certifican los nuevos heads.

Fases 3–5 y UX tienen cambios y pruebas en #230/#231; no corresponde seguir declarándolas «no ejecutadas» como estado global. Su alcance es el descrito en esos PR; todavía falta su revisión e integración. El NO-GO para producción sigue por decisiones fiscales, infraestructura/respaldos reales, dispositivos físicos y aceptación. Reactivar Comisiones exige especificación aprobada e implementación con pruebas, no solo retirar el bloqueo.

Sin merge a main, despliegue ni bases reales. Próximo paso: revisar los nuevos SHA, su CI y los pendientes humanos. Las secciones siguientes conservan la fotografía histórica del sprint; sus estados iniciales quedan sustituidos por esta sección.

---

# Seguimiento del sprint nocturno de cierre — Jowa System 1.0 (2026-10-30)

Documento de continuidad. Distingue lo que está **implementado**, **probado en entorno aislado**, **validado en preproducción**, **pendiente de prueba física**, **pendiente de aprobación** y **verificado en producción**. Hasta esta fecha **nada está verificado en producción**.

## 1. Estado inicial verificado (GitHub, 2026-10-30)

| Elemento | SHA / estado | Notas |
|---|---|---|
| `main` | `a4ab291aba1a8574e9c66d59b044e35f938bda38` | Sin cambios durante el sprint |
| #225 auditoría de salida (borrador) | `4a13423c752293ddad1f249746d1c374a8f99201` | CI verde; sin conflictos con `main`. Documenta Comisiones como bloqueado: queda desactualizado cuando se integre #226 |
| #226 desactivar Comisiones (listo para revisión) | `ba41159ff416f495fb0dc18eaf44ac0648308bcf` | Otro agente. CI verde (`validate`, `test`, `guard-base-datos`); sin conflictos con `main` |
| #227 matriz fiscal (borrador) | `4cbffb032ed939359b6614b186ab2c24df59fefe` | CI verde; sin conflictos |
| #228 infraestructura y checklist (borrador) | `1d5675aeebe18431f2a6e71316a043826ed5f434` | CI verde; sin conflictos |

Ancestría: ninguno de los cuatro PR está integrado en `main` (verificado con `git fetch` el 2026-10-30).

## 2. Verificación independiente de #226

Worktree aislado en el head `ba41159`, con dependencias y PostgreSQL temporal:

| Prueba | Resultado |
|---|---|
| Backend unitarias (`vitest run`) | 76 archivos, **835/835** |
| Frontend unitarias (`npm test`) | **576/576** |
| Integración PostgreSQL (`saas-onboarding`, `ventas`, `caja`, `REAL_SETTINGS_BROWSER=1`) | 3 archivos, **78/78** |
| Navegador (`guide.spec.ts`, `navigation-settings.spec.ts`) | **75/75** |

Comprobaciones de código:
- `comisiones_venta` no aparece en defaults, catálogo configurable ni seed (`backend/src/common/tenant-modules.ts`, `backend/prisma/seed.ts`).
- Backend: solo queda la tabla de dependencias `comisiones_venta: ['pos','usuarios']` (`tenant-modules.ts:30`), que no activa nada.
- Frontend: ruta `/comisiones` protegida por `PENDING_MODULES` (`App.tsx:380-386`, `ProtectedRoute.tsx`), menú y buscador filtrados por `canNavigate` (`taskNavigation.ts`).

**Dictamen técnico de #226: correcto y listo para revisión.** No se hace merge.

## 3. Fase 2 — Comisiones

- **Decisión adoptada:** exclusión segura del módulo para el piloto, sin implementar cálculos. Motivo: no hay especificación aprobada de comisiones (base, devengo, devoluciones, anulaciones, liquidación). Inventar reglas comerciales está prohibido por el encargo.
- **Qué no se verificó todavía:** que Reportes y Contabilidad no dependan de Comisiones. La prueba de #226 cubre POS, ventas, usuarios, caja, entregas y devoluciones; Reportes se comprueba solo en la navegación.
- **Riesgo residual:** #225 y #226 modifican ambos `docs/CONTEXTO_MAESTRO.md`. Al integrar #226, #225 quedará con texto de Comisiones desactualizado y conflicto documental.
- **Pendiente para reactivar Comisiones:** especificación aprobada por el dueño (base de cálculo, devoluciones, anulaciones, ventas a crédito, periodos, redondeo) y su implementación con pruebas. No está pendiente de código.

## 4. Fases 3–9 — estado honesto

| Fase | Estado | Motivo / siguiente paso |
|---|---|---|
| 1 Estado y consolidación | **Hecho** para los cuatro PR | Ver §1 |
| 2 Comisiones | **Hecho** vía #226 (verificado) | Ver §3 |
| 3 Defectos P0/P1 de operación | **No ejecutado en esta sesión** | No se hizo un barrido nuevo. Los defectos conocidos son solo los de la auditoría #225 (AUD-COM-01/02/03). Siguiente paso: barrido de idempotencia y doble cobro |
| 4 Contingencia offline | **Parcial** | Existen 14 archivos de contingencia (214 pruebas) y `contingencia-real` 15/15. No se escribieron pruebas nuevas de red o reintentos |
| 5 Seguridad y multi-tenant | **Parcial** | `aislamiento-barrido` 7/7 y barrido de roles VENDEDOR/BODEGUERO/CONTADOR en #225. No hubo auditoría nueva de guards |
| 6 Infraestructura | **Documentada** en #228 | Verificable en repositorio; paneles, respaldo productivo y SMTP real pendientes |
| 7 Frontend y UX | **No evaluado** | Sin cambios |
| 8 Pruebas completas | **Parcial** | Se ejecutó la suite de #226 y la de #225 en su momento |
| 9 PRs pequeños | **Hecho** para este alcance | Este documento se publica en su propia rama |

## 5. Bloqueos y decisiones humanas

1. **Dueño:** aprobar la exclusión de Comisiones (#226) o aportar la especificación para implementarla.
2. **Contador:** las decisiones D1–D11, C-02/C-04 y el texto del comprobante (AUD-FIS-01) de #227.
3. **Dueño/infraestructura:** verificar Render, Vercel y Supabase; destino de respaldo; RPO/RTO; SMTP real con autorización.
4. **Equipos físicos y cliente:** checklist de #228 y aceptación firmada.
5. **Revisión humana:** merge de #226, #225, #227 y #228 solo con aprobación explícita del propietario.

## 6. Riesgos para producción

- No hay GO técnico completo: faltan los puntos 1–4 de §5.
- #225 queda desactualizado tras integrar #226; hay que conciliar `docs/CONTEXTO_MAESTRO.md`.
- La contingencia y la idempotencia solo tienen evidencia de pruebas existentes, no un barrido nuevo.

## 7. Siguiente acción recomendada

1. Revisar #226 y decidir su merge (requiere aprobación del propietario).
2. Tras el merge de #226, conciliar #225 con `main`.
3. Ejecutar el barrido de idempotencia y doble cobro (Fase 3) y de contingencia (Fase 4).

## 8. Dictamen técnico

**NO-GO técnico** para producción con datos reales. Motivo: decisiones humanas pendientes y verificaciones externas no hechas. Ninguna verificación en producción.

## Actualización 2026-10-31 (verificada en GitHub)

- **#226 fusionado** en `main` el 2026-10-31 00:30:47Z por Nelosama (`merge` `46f7db7`). El estado «listo para revisión» de la sección 1 queda superado.
- **#225** tenía un conflicto documental en `docs/CONTEXTO_MAESTRO.md`. Resuelto con un merge normal de `main` (`a8ddd1b`, sin rebase). Su prueba de Comisiones pasó de `test.fail()` a verificar la exclusión (`19786a6`), comprobada en e2e-real contra el backend real (1/1).
- **#227 y #228** pasaron a «listo para revisión» (no borrador) por Nelosama. Sus heads no cambiaron (`4cbffb0` y `1d5675a`); sus pruebas siguen siendo las de sus SHA.
- **#231** (contingencia, seguridad y UX) sin conflictos con el nuevo `main`; CI en success en `4d68934`.
