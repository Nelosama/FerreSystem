# Plan de ejecución de pendientes — 2026-11-02

> Plan operativo derivado de [PLAN_SALIDA_PRODUCCION_20261102.md](PLAN_SALIDA_PRODUCCION_20261102.md). No concede merges, despliegues, migraciones productivas, cambios en paneles ni envíos de correo. Cada fila indica quién puede hacerlo.

## Estado de partida

- `main` = `20f356c` (merge de #234: ISV de cotizaciones, comprobante sin CAI, RTN opcional, barrido de fechas). Checks de `main` en ese SHA: **en curso** al redactar este plan (último estado visto: en progreso desde 04:56 UTC). Hasta que terminen en verde, `main` no está verificado.
- PR #233 cerrado sin integrar (superado por #234).
- Ramas por borrar tras confirmar el CI de `main`: `claude/sweet-ritchie-wrwsbo`, `codex/barrido-fechas-20261102`.
- Producción sigue con `46f7db7`: Render con Auto-Deploy apagado y Vercel bloqueando `main`.

## Bloque A — Verificación y cierre de integración (yo)

| # | Tarea | Estado | Criterio de salida |
|---|---|---|---|
| A1 | Confirmar checks de `main` en `20f356c` | En curso | Ambos workflows en success; si falla, corregir antes de cualquier otra cosa |
| A2 | Borrar `claude/sweet-ritchie-wrwsbo` y `codex/barrido-fechas-20261102` | Pendiente de A1 | Ramas ya ancestro de `main` o contenido idéntico; borrado confirmado |
| A3 | Actualizar `CONTEXTO_MAESTRO.md` y el plan con #234 integrado y el SHA verificado | Hecho en este plan; falta A1 | Fotografía 2026-11-02 refleja el estado real |

## Bloque B — Decisiones del dueño (bloquean implementación)

| # | Decisión | Opción por defecto si no decides | Bloquea |
|---|---|---|---|
| B1 | C-01: tope del ISV de compras | 15 % del subtotal con revisión manual | Cambio en `compras-isv` |
| B2 | C-02/C-04: compras como crédito fiscal | No: solo registro de costo hasta cierre de periodo | Libros de compras |
| B3 | OpenAI: retirar o mantener sin clave | Mantener sin clave (inerte) | Eliminar `backend/src/ia/` |
| B4 | Título del comprobante | «COMPROBANTE DE VENTA» | Texto del PDF |
| B5 | RPO y RTO aceptados; consentimiento para datos reales | — (sin defecto) | Fase 3 y F5/F8 |
| B6 | Confirmar que el RTN lo configura el Super Admin | Sí (ya implementado así) | — |

Sin decisión, B1–B4 usan su opción por defecto solo en código no fiscal; B1 y B2 no se implementan hasta decidirlas.

## Bloque C — Desarrollo (yo y Codex)

| # | Tarea | Quién | Dependencia | Estado |
|---|---|---|---|---|
| C1 | Copiar RTN a cada venta (`ventas.emisor_rtn`, nullable, sin relleno de históricos) | Yo: propuesta de migración para revisión NEXUS; no se aplica hasta aprobación | NEXUS | Propuesta a redactar en esta sesión |
| C2 | Limitar ISV de compras | Codex, tras B1 | B1 | Bloqueada |
| C3 | Retirar SDK OpenAI | Codex, tras B3 | B3 | Bloqueada |
| C4 | Servicio `facturacion_cai` (1–2 semanas) | Codex por fases, con NEXUS | Después de la salida; no bloquea | Diseño listo |
| C5 | Monitor externo de disponibilidad (`/api/health/live`) | Tú: requiere cuenta en el servicio | Acceso del dueño | Pendiente |

## Bloque D — Infraestructura (solo tú: requiere paneles)

| # | Panel | Acción | Verificación |
|---|---|---|---|
| D1 | Render | Start Command `npm run start:prod`; health check `/api/health/live`; Pre-Deploy vacío; Auto-Deploy off | Captura de la configuración con nombres de variables, sin valores |
| D2 | Render | Variables requeridas presentes; ausentes `POS_OFFLINE_ENABLED`, `OPENAI_API_KEY`, `SUPABASE_*` | Lista de nombres |
| D3 | Vercel | `VITE_API_URL` en Production y Preview; rama de producción `main` | Captura |
| D4 | Supabase | Plan, respaldos diarios y PITR, retención | Captura o texto del panel |
| D5 | Supabase | Historial de migraciones en solo lectura (`estado-base-solo-lectura.sql`) | Salida sin `INCOMPLETA`, `CHECKSUM_DISTINTO` ni `DESCONOCIDA_EN_BASE` |
| D6 | Respaldo FS-41 | Destino independiente, cifrado y frecuencia según RPO | Primer respaldo verificado |
| D7 | SMTP | Envío de prueba a buzón controlado con `SMTP_STAGING_CONFIRMAR=ENVIAR` | Correo recibido; autorización explícita |

## Bloque E — Preproducción (yo, con acceso del dueño)

| # | Tarea | Criterio |
|---|---|---|
| E1 | Proyecto Supabase, servicio Render y despliegue Vercel de preproducción separados | Secretos distintos de producción |
| E2 | `migrate:deploy` una vez en preproducción; log `Nest application successfully started` | Sin errores |
| E3 | `humo-preproduccion.mjs --escribe` | 22/22 |
| E4 | Ensayo de migraciones con volumen representativo | Sin pérdida de filas |
| E5 | Restauración cronometrada del respaldo FS-41 | RTO y RPO medidos y dentro de lo aceptado en B5 |
| E6 | Checklist físico A, C, D, E en los equipos de la tienda | A2, C1, D1 aprobados |

## Bloque F — Aceptación y salida (dueño y cliente)

| # | Tarea | Responsable |
|---|---|---|
| F1 | Inventario real con el flujo de inventario inicial seguro | Dueño con apoyo técnico |
| F2 | Usuarios reales, roles y contraseñas; retiro de cuentas demo | Dueño |
| F3 | Capacitación de administrador y cajeros; protocolo de apagón entregado | Dueño |
| F4 | Firmas F1–F8 del checklist | Dueño y cliente |
| F5 | Ventana de salida fuera de horario, caja del día cerrada, respaldo verificado | Dueño ordena; yo ejecuto los pasos |

## Orden de ejecución propuesto

1. **Hoy:** A1 y A2; A3 con el estado real.
2. **En paralelo:** tú tomas B1–B5 y el bloque D; yo redacto C1 (propuesta NEXUS) y preparo la lista exacta de lo que necesito de cada panel.
3. **Después de B y D:** C2, C3 y E1–E3.
4. **Después de E:** E4–E6 y F1–F4.
5. **Salida:** F5, con orden expresa.

## Qué no puedo hacer yo

- Entrar a Render, Vercel o Supabase ni leer valores de variables.
- Decidir fiscalidad, tasas o títulos legales.
- Enviar correos reales o hacer pruebas en equipos físicos.
- Ejecutar migraciones o despliegues productivos sin orden expresa.

## Historial

- 2026-11-02: plan de ejecución creado a partir de #234 integrado y de las decisiones tomadas. Sin cambios de producción.
