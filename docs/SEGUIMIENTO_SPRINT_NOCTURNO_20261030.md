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
