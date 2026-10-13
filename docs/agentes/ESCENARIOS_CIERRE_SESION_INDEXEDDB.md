# Escenarios E2E: cierre de sesión con ventas pendientes en IndexedDB

**Responsable del diseño:** CENTINELA. **Coordinación requerida:** ATLAS (sincronización offline, PR #129) y FARO (QA y evidencia).
**Estado:** escenarios definidos, **no implementados ni ejecutados**. Ninguna identidad de ATLAS ni de FARO estaba activa en la sesión de diseño, así que la coordinación está pendiente (ver §4).

## 1. Contrato verificado en el código

| Elemento | Dónde | Comportamiento |
|---|---|---|
| Base local | `frontend/src/offline/db.ts` | IndexedDB `ferresystem-contingencia`, almacén `operaciones` con clave `operacionId` (UUID). |
| Estado de envío | `frontend/src/offline/sync.ts` | `PENDIENTE` → `ENVIANDO` → `SINCRONIZADA` / `REVISION` / `RESUELTA_MANUAL`. |
| Quién puede enviar | `puedeEnviar` en `sync.ts` | Solo el cajero que creó la operación (`cajeroId`) o un ADMIN. |
| Respuesta 401/403 | `sync.ts` (manejo de error) | La operación vuelve a `PENDIENTE` con «Inicie sesión para enviar las ventas pendientes». No se pierde ni se marca como error. |
| Cierre de sesión | `TenantContext.logout` | Borra claves de `localStorage` y llama `POST /auth/logout`. **No borra IndexedDB.** |
| Idempotencia | Backend `contingencia.service.ts` | El mismo `operacionId` no duplica venta, caja, stock ni numeración. |
| Revocación | Backend (#133) | Logout, cambio de contraseña y desactivación revocan la sesión; el siguiente envío responde 401. |

## 2. Escenarios

Cada escenario indica precondiciones, pasos, verificaciones en tres capas (UI, IndexedDB y PostgreSQL) y el resultado esperado. Usa la infraestructura de `frontend/e2e-real/` (API real, PostgreSQL temporal, `context.setOffline`).

### E1 — Logout con ventas pendientes y nuevo inicio de sesión
- **Precondiciones:** cajero A con caja abierta; dispositivo registrado; ventana emitida; dos ventas en efectivo registradas sin conexión.
- **Pasos:** 1) cerrar sesión; 2) comprobar IndexedDB; 3) iniciar sesión como A; 4) sincronizar.
- **Verificar:** tras 1, IndexedDB tiene las dos operaciones `PENDIENTE` con sus `operacionId`. Tras 4, ambas `SINCRONIZADA` con correlativo central; en PostgreSQL existe una venta por `operacionId`; el stock descuenta una vez.
- **Lo que prueba:** el logout no destruye la cola local.

### E2 — Revocación por administrador con ventas pendientes
- **Pasos:** 1) con dos ventas pendientes, un ADMIN cambia la contraseña de A desde la interfaz; 2) el equipo intenta sincronizar; 3) A inicia sesión con la nueva clave; 4) sincronizar.
- **Verificar:** en 2, la respuesta es 401, las operaciones siguen `PENDIENTE` con el mensaje de sesión, y PostgreSQL no tiene ventas nuevas. Tras 4, se aplican una vez.

### E3 — Access token vencido con refresh válido (sin interacción)
- **Pasos:** 1) forzar expiración del access token (manipular el reloj o usar un token con `exp` pasado en `localStorage`); 2) sincronizar.
- **Verificar:** el interceptor llama `/auth/refresh` y reintenta; las operaciones se aplican sin que el cajero vea un error. No hay segundo inicio de sesión.

### E4 — Refresh vencido (sesión de 7 días terminada)
- **Pasos:** 1) eliminar o vencer la cookie de refresh; 2) sincronizar; 3) iniciar sesión; 4) sincronizar.
- **Verificar:** en 2 el usuario ve la pantalla de inicio de sesión y las operaciones permanecen en IndexedDB. Tras 4, se aplican una vez.

### E5 — Cajero distinto en el mismo equipo (regla de propiedad)
- **Pasos:** 1) cajero A deja dos ventas pendientes y cierra sesión; 2) inicia sesión cajero B en el mismo equipo; 3) B intenta sincronizar; 4) A vuelve a iniciar sesión y sincroniza.
- **Verificar:** en 3, las ventas de A **no** se envían (la regla `puedeEnviar` lo impide) y el resultado devuelve `sinSesion=true`. **Pendiente de confirmar:** qué muestra la interfaz en ese caso (el código no lo muestra en los componentes revisados). En 4, se aplican.
- **Riesgo que expone:** si A no vuelve, sus ventas quedan bloqueadas en ese equipo hasta que lo haga un ADMIN. **Decisión de producto pendiente** (ATLAS y el responsable): si un ADMIN puede enviar en nombre de A, o si la interfaz debe ofrecer la transferencia de la cola.

### E6 — Recarga y cierre del navegador con ventas pendientes
- **Pasos:** 1) dos ventas pendientes; 2) recargar la página; 3) cerrar y reabrir el navegador; 4) iniciar sesión; 5) sincronizar.
- **Verificar:** IndexedDB conserva las operaciones tras 2 y 3; se aplican una vez en 5.

### E7 — Dos pestañas: logout en una, sincronización en la otra
- **Pasos:** 1) dos pestañas con la misma sesión; 2) con dos ventas pendientes, cerrar sesión en la pestaña 1; 3) disparar sincronización en la pestaña 2.
- **Verificar:** la pestaña 2 recibe 401 y no reenvía con la sesión revocada; el estado es coherente en ambas (no hay operaciones duplicadas al volver a iniciar sesión).

### E8 — Corte de red durante el envío (idempotencia)
- **Pasos:** 1) enviar un lote y cortar la red antes de recibir la respuesta (`setOffline` tras la petición); 2) restablecer la red; 3) sincronizar otra vez.
- **Verificar:** PostgreSQL tiene una sola venta por `operacionId`; la interfaz muestra `SINCRONIZADA` una vez.

### E9 — Sesión de soporte no afecta la cola del cajero
- **Pasos:** 1) cajero A con dos ventas pendientes en el equipo; 2) un Super Admin abre soporte sobre la empresa y cierra la sesión de soporte; 3) A sincroniza.
- **Verificar:** la sesión de soporte no borra ni envía las operaciones de A; tras 3 se aplican una vez.

## 3. Requisitos técnicos para implementar

- Helper para leer el diario en IndexedDB (ya existe `diario(page)` en `contingencia-real.spec.ts`).
- Helper para revocar una sesión desde la interfaz del administrador (cambio de contraseña) sin tocar la base directamente.
- Cuenta de cajero y caja en `frontend/e2e-real/seed.cjs` (ya existen cajeros de prueba).
- Para E3, una forma reproducible de vencer el access token: `exp` pasado en la sesión del navegador, sin modificar el backend.
- Ejecución: `POS_OFFLINE_ENABLED=true`, navegador `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (ver informe de validación final).

## 4. Coordinación

**Estado:** pendiente. En la sesión de diseño no había agentes activos (`ListAgents` vacío), así que no se envió ningún mensaje. Texto para enviar cuando estén disponibles:

- **A ATLAS:** «CENTINELA necesita implementar los escenarios E1–E9 de `docs/agentes/ESCENARIOS_CIERRE_SESION_INDEXEDDB.md` en `frontend/e2e-real/`. Antes de empezar, confirmar que la regla `puedeEnviar` (E5) es la decisión de producto vigente y que no hay trabajo en curso sobre `sync.ts`, `db.ts` o `TenantContext.tsx`.»
- **A FARO:** «Solicitamos revisar la matriz de E1–E9 y la evidencia de ejecución (capturas, trazas de IndexedDB y consultas de PostgreSQL). E5 requiere decisión de producto antes de considerarse aprobado.»

**Regla:** ningún escenario se declara aprobado hasta que FARO revise la evidencia de ejecución real.

## 5. Criterio de cierre

El escenario queda cerrado cuando: a) el test existe en `frontend/e2e-real/` y pasa sobre el backend real; b) hay evidencia de IndexedDB y de PostgreSQL; c) FARO lo aprueba; d) E5 tiene decisión de producto registrada.
