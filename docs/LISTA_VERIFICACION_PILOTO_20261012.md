# Piloto de la ferretería — alcance, bloqueantes y lista de verificación ejecutable (2026-10-12)

**Candidato:** PR #155 (rama `claude/preproduccion-entrega`, base = PR #153 `claude/h5-identidad-operacion-a` @ `95144a17`). Este documento no autoriza merge, despliegue ni migraciones: cada autorización está nombrada en §4. Sin secretos.

## 1. Estado

| | |
|---|---|
| **Producción hoy** | **NO-GO**: faltan condiciones que solo cumplen personas con acceso (§3, P0) |
| **Técnicamente** | **Apto para autorizar PREPRODUCCIÓN y, después, un piloto limitado con la contingencia APAGADA**: el ciclo del piloto pasa de punta a punta en backend y PostgreSQL reales y en el ensayo de actualización (24/24); no hay defecto conocido que comprometa dinero o inventario en ese alcance |
| `main` | `7ccfad25`. **No contiene** entregas, caja, contingencia ni seguridad fase 2/3: el candidato lleva ~196 commits por encima de `main` y 11 migraciones (13 → 24). Poner el piloto en marcha **exige** integrar el candidato a `main` (o apuntar Render/Vercel a la rama), con su autorización |
| Qué es qué | **#151 es un Issue** (coordinación); **#153** y **#155** son PR en borrador; #154 ya se integró. Ningún PR tiene aprobación humana |

## 2. Alcance mínimo del piloto frente a la evidencia

Evidencia: `frontend/e2e-real/piloto-ciclo-completo-real.spec.ts` (**11/11**, backend real + PostgreSQL real, sin mocks), `e2e-real` completa **135 aprobadas / 10 omitidas / 0 fallos**, ensayo de actualización **24/24**.

| Capacidad del piloto | Estado | Evidencia |
|---|---|---|
| Iniciar sesión como administrador y cajero | **Lista** | Piloto 1; `inicio-roles`; humo de API |
| Registrar productos con código, descripción, costo y precio | **Lista** | Piloto 1 (el código se normaliza a MAYÚSCULAS) |
| Registrar inventario inicial | **Lista** | Piloto 1 (alta con existencias), `negocio-ciclo-real` (ajuste con existencias anteriores; ajuste obsoleto 409) |
| Consultar existencias y precios | **Lista** | Piloto 2: el administrador ve el costo; el **cajero ve precio y existencias, nunca el costo** |
| Venta de contado | **Lista** | Piloto 4, 6: total con ISV 15 %, reserva de existencia, reintento y doble clic = una sola venta |
| Cobro en efectivo | **Listo** | Piloto 4, 9 |
| Cobro con tarjeta | **Listo** | Piloto 4-5: exige referencia bancaria; la misma referencia no se reutiliza (409) |
| Cobro por transferencia | **Listo** (antes no tenía prueba) | Piloto 4-5: exige referencia; sin ella 400; reutilizada 409 |
| Controlar la entrega de mercancía | **Lista, con una regla que debe conocer el dueño** | Piloto 7, 7b. Entrega **completa**; la confirman **administración o bodega**; el descuento de inventario ocurre una sola vez aunque se repita |
| Consultar ventas realizadas | **Lista** | Piloto 8 (historial y auditoría con usuario y hora), `historial-auditoria-real` |
| Cierre de caja básico | **Listo** | Piloto 9: el efectivo esperado suma **solo efectivo**; la diferencia exige explicación; el cierre repetido no duplica; con la caja cerrada no se vende |
| Ningún duplicado ni movimiento sin trazabilidad | **Verificado** | Piloto 6, 8: ventas = cobros = auditoría; ningún cobro sin venta |
| Aislamiento entre empresas | **Verificado** | Piloto 10 |

**Capacidades que el piloto necesita y NO existen o no están habilitadas (no se implementan sin su autorización):**
1. **Entrega inmediata «al mostrador» por el cajero: NO permitida por diseño.** El cajero recibe 403 «Su rol no registra entregas físicas. Use *Cobrar y dejar en bodega*». Quien confirma la entrega es administración o bodega. Si en la ferretería el mismo mostrador cobra y entrega, **el dueño debe decidir** (a) que el dueño/administrador venda desde su propia caja con entrega inmediata (verificado), o (b) que haya una segunda persona (bodega/administración) que confirme las entregas, o (c) autorizar un cambio de regla (decisión de seguridad; no se hizo).
2. **Vuelto (cambio) en el POS en línea:** no se calcula. El cajero lo calcula; el sistema registra el total y la caja concilia por totales.
3. **Entrega parcial:** no implementada (`docs/POS_VENTA_ENTREGA_DECISION.md`). Alternativa: entregar completo o dividir la venta.
4. **Venta sin internet:** la contingencia está **apagada** por defecto; sin conexión no se puede cobrar en el sistema (procedimiento manual acordado por escrito).
5. **Facturación fiscal (SAR/CAI):** el sistema **no emite numeración fiscal**; la referencia de factura externa es solo informativa. Definir con el contador cómo se factura legalmente.
6. **Ventas a crédito:** existen y están probadas (`qa-ciclo-venta` 3.x, abonos), pero **no son parte del piloto** y no bloquean nada; pueden dejarse sin habilitar a clientes.

## 3. Clasificación de problemas

| Nivel | Problema | Tratamiento |
|---|---|---|
| **P0** (impide operar o compromete dinero, inventario o seguridad) | 1) Respaldos de producción sin configurar ni restauración probada allí · 2) `CONTINGENCIA_CLAVE_OPERACIONES` sin definir en Render (el backend no arranca) · 3) `NODE_ENV=production` sin verificar (si no, `JWT_SECRET` usa un valor de desarrollo **público**) · 4) `main` no contiene el candidato · 5) estado de la base de producción desconocido (¿variante alterna de `20261011150000`? ¿precondiciones de `20261012…`?) · 6) migración `20261017000000` sin aprobación del CODEOWNER (usted) | Solo personas con acceso/autoridad. Todo lo preparable está hecho (§4) |
| **P1** (afecta un flujo esencial del piloto) | A) Entrega inmediata por el cajero no permitida (§2.1) · B) Safari/iPhone, impresión, lector y Wi-Fi sin probar en equipos reales · C) Render/Supabase/Vercel sin verificar (esta sesión no tiene acceso de red a ellos) | A: decisión suya. B/C: `docs/CHECKLIST_EQUIPOS_REALES.md` y runbook |
| **P2** (se corrige tras iniciar) | Vuelto en el POS · entrega parcial · numeración fiscal · datáfono · reporte por cajero · prueba 3 de contingencia lenta bajo carga (contingencia apagada) · `productos-edicion.spec.ts:155` intermitente (1 de 4) | Backlog |
| **P3** | Mejoras opcionales (D-2 de hindi corto, etc.) | Backlog |

**Defectos de producto nuevos en esta ronda: ninguno.** (Lo hallado fue una regla de diseño —A— y una carencia de cobertura: la transferencia no tenía prueba real; ya la tiene.)

## 4. Lista de verificación ejecutable

Convención: **[P]** = propietario autoriza o decide · **[X]** = ejecuta quien tiene acceso (propietario o quien él delegue) · **[R]** = ya hecho/verificado en el repositorio. Marque cada casilla con fecha y evidencia (sin valores secretos).

### Fase 0 — Decisiones y autorizaciones (propietario)
- [ ] **[P]** Aprobar o rechazar la migración `20261017000000` como CODEOWNER en el PR #153 (`docs/MIGRACIONES_20261011150000_Y_20261017000000.md`).
- [ ] **[P]** Revisar y aprobar el cambio de arranque del PR #155 (`start:prod` ya no migra; CODEOWNERS toca `migration-safe.mjs` y `deploy/`).
- [ ] **[P]** Decidir: salir con la **contingencia apagada** (recomendado) o esperar la auditoría independiente de CENTINELA/FARO (sin respuesta hasta hoy).
- [ ] **[P]** Decidir la regla de entrega en mostrador (§2.1) y el vuelto (§2.2).
- [ ] **[P]** Autorizar por escrito, por separado: (1) despliegue de **preproducción**, (2) merge a `main`, (3) ventana de **producción**.

### Fase 1 — Preproducción (infraestructura separada de producción)
- [ ] **[X]** Proyecto Supabase, servicio Render y despliegue Vercel de preproducción con claves **distintas** a producción (`docs/RUNBOOK_PREPRODUCCION_Y_PRODUCCION.md` §1-2).
- [ ] **[X]** `psql "$DIRECT_URL" -X -f backend/scripts/estado-base-solo-lectura.sql` en la base de preproducción y revisar la salida.
- [ ] **[X]** `cd backend && DIRECT_URL=… npm run migrate:deploy` **una vez**.
- [ ] **[X]** Desplegar el backend de la rama del PR #155; ver `Nest application successfully started`; `/api/health` = 200.
- [ ] **[X]** `API_URL=…/api ADMIN_EMAIL=… ADMIN_PASSWORD=… CAJERO_EMAIL=… CAJERO_PASSWORD=… SUPERADMIN_EMAIL=… SUPERADMIN_PASSWORD=… CONFIRMO_ENTORNO_NO_PRODUCTIVO=SI node backend/scripts/humo-preproduccion.mjs --escribe` → **22 de 22 PASS** (la auditoría la consulta el Super Admin).
- [ ] **[X]** Reiniciar el servicio en Render y repetir el humo sin `--escribe` (9 de 9): datos y sesión siguen.
- [ ] **[X]** Recorrer `docs/CHECKLIST_EQUIPOS_REALES.md` contra preproducción (computadoras, iPhone/Safari, impresora, lector, Wi-Fi, corte de internet).

### Fase 2 — Condiciones previas de producción
- [ ] **[X]** Respaldos de Supabase activos (plan y fecha del último respaldo anotados).
- [ ] **[X]** `FERRE_ORIGEN_URL=<directa> bash backend/scripts/respaldo-previo-migracion.sh <carpeta privada>` y `bash backend/scripts/verificar-respaldo.sh <carpeta> --ensayo-migracion` → **VERIFICADO** (si dice NO VERIFICADO, **no se migra**).
- [ ] **[X]** `estado-base-solo-lectura.sql` sobre producción (solo lectura): sin `INCOMPLETA`, `APLICADA_CHECKSUM_DISTINTO` ni `DESCONOCIDA_EN_BASE`; sección 5 toda en **0** (si no, `propuestas/entregas-148/00_normalizar_historico_previo.sql` con su autorización y respaldo).
- [ ] **[X]** Render producción: `NODE_ENV=production`, `DATABASE_URL`, `DIRECT_URL` (directa), `JWT_SECRET`, **`CONTINGENCIA_CLAVE_OPERACIONES`** (nueva, ≥ 32 aleatorios, distinta de `JWT_SECRET`), `FRONTEND_URLS`, `TRUST_PROXY=1`; **sin** `POS_OFFLINE_ENABLED` ni `FERRE_MIGRAR_AL_ARRANCAR`; Pre-Deploy **vacío**; Health `/api/health`; Start `npm run start:prod`.
- [ ] **[X]** Vercel producción: `VITE_API_URL=https://<servicio>.onrender.com/api`; el dominio en `FRONTEND_URLS`.

### Fase 3 — Producción (solo con la autorización [P] de merge y ventana; caja del día cerrada; fuera del horario de ventas)
- [ ] **[X]** Merge a `main` autorizado (o rama de despliegue acordada).
- [ ] **[X]** Respaldo manual **inmediatamente antes** (Fase 2) y confirmado.
- [ ] **[X]** `DIRECT_URL=<producción> npm run migrate:deploy`.
- [ ] **[X]** Desplegar el backend (manual) y vigilar el registro; desplegar el frontend.
- [ ] **[X]** `humo-preproduccion.mjs` **sin** `--escribe` contra producción (9 comprobaciones; solo lectura).
- [ ] **[P]** Venta de prueba real **solo si usted la autoriza** (producto de prueba, efectivo, entrega y cierre de esa caja); queda en los libros.
- [ ] **[X]** Entregar al cliente con la contingencia **apagada** y el procedimiento manual sin internet por escrito.

### Fase 4 — Después
- [ ] Revisar la auditoría y el cierre de caja cada día las primeras dos semanas; respaldo verificado cada semana.
- [ ] Habilitar la contingencia **solo** en una empresa piloto y **solo** tras la auditoría independiente.

## 5. Marcha atrás

| Disparador | Acción |
|---|---|
| El backend no arranca (falta de clave, `CHECKSUM_DISTINTO`, migración incompleta) | No improvise: corregir la variable o seguir `docs/MIGRACIONES_…md`. Render normalmente conserva la versión anterior sana si el despliegue nuevo falla |
| Frontend defectuoso | Vercel → *Instant Rollback* a la versión anterior |
| Inconsistencia de inventario o de caja en el recorrido de humo | **Restaurar la copia previa** (`docs/RUNBOOK_…md` §4). `git revert` **no** revierte una migración. Se pierde toda venta posterior a la copia: por eso la ventana va con caja cerrada |
| Backend anterior sobre la base ya migrada | **No verificado**: no asumir que funciona sin restaurar |

## 6. Responsables

| Autorización / tarea | Responsable |
|---|---|
| Aprobar migración, arranque, merge, ventana, despliegue, venta real de prueba | **Propietario (@Nelosama)** |
| Configurar Render, Supabase y Vercel; ejecutar migración, respaldo y humo | Propietario o quien tenga acceso a las cuentas |
| Auditoría independiente | CENTINELA y FARO (sin respuesta; los subagentes de esta sesión **no** los sustituyen) |
| Revisión de esquema | NEXUS (sin canal confirmado) |

## 7. Tiempo estimado hasta iniciar el piloto

Camino **sin esperar la auditoría independiente** (contingencia apagada), si usted decide y alguien con acceso ejecuta: **unos 3 a 5 días hábiles** — día 1: decisiones, proyecto de preproducción y migración; día 2: preproducción y humo; día 3: recorrido en los equipos de la ferretería y respaldos de producción verificados; día 4: ventana de producción (medio día) y primera semana de vigilancia. **Incertidumbres:** nunca se probó nada contra Render, Supabase ni Vercel (pueden aparecer problemas de plan, IPv6 en la conexión directa, CORS o variables); el estado real de la base de producción es desconocido (si la sección 5 de `estado-base-solo-lectura.sql` da filas, hay que normalizar con autorización, **+½ a 1 día**); Safari/iPhone y la impresión pueden revelar ajustes; la decisión sobre la entrega en mostrador puede exigir un cambio de regla. **Si se exige la auditoría de CENTINELA/FARO, no puedo estimarlo**: no han respondido por ningún canal disponible.
