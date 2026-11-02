# Plan de salida a producción — Jowa System 1.0 (2026-11-02)

> Plan, no autorización. Ningún paso de este documento concede merge, despliegue, migración productiva, lectura de bases reales, cambio de paneles ni envío de correo: cada uno requiere la orden expresa del dueño. Las fechas son estimaciones de ingeniería; la ruta crítica depende de respuestas humanas.

## 1. Punto de partida (comprobado el 2026-11-02)

- `main` = `c436592f3df5e889c69d1eee0d35e8e505cb4bb7` (merge de #232). Ambos workflows en **success** en ese SHA: [Operación de ferretería 41174096543](https://github.com/Nelosama/FerreSystem/actions/runs/41174096543) y [Piloto con API y PostgreSQL reales 41174096545](https://github.com/Nelosama/FerreSystem/actions/runs/41174096545). **No hay PR abiertos.**
- Última evidencia local completa (fotografía 2026-10-31): backend 835/835, frontend 585/585, integración PostgreSQL 1261 aprobadas / 2 fallos esperados, piloto real navegador→API→PostgreSQL 186/0/2 omitidas.
- **Dictamen vigente: NO-GO.** El bloqueo no es de código: son decisiones fiscales, infraestructura sin verificar, respaldos reales, hardware y aceptación del cliente.
- Producción actual: Render y Vercel sirven `46f7db7` (anterior a #225–#232). Render con Auto-Deploy Off (consulta 2026-10-30); Vercel bloquea `main` por `frontend/vercel.json` y `frontend/scripts/vercel-ignore.sh`.

## 2. Alcance propuesto del primer arranque (sin decisiones nuevas)

Es el único camino que no depende de respuestas pendientes; el dueño debe aprobarlo (F1 del checklist).

| Incluido | Excluido / apagado |
|---|---|
| POS en línea, cotizaciones (solo 15 %), inventario/precios/kardex, levantamiento, clientes y crédito, proveedores, caja, entregas, devoluciones gravadas, usuarios, Super Admin, reportes de resumen | Exenciones (bloqueadas), `FISCAL_DESGLOSE_POR_LINEA` apagado, Contabilidad apagada, Comisiones excluido, apartados/transferencias/pedidos especiales/listas de precio ocultos, **contingencia offline apagada** (`POS_OFFLINE_ENABLED` sin definir), compras sin uso como crédito fiscal salvo revisión manual, `OPENAI_API_KEY` sin cargar |

Si el dueño quiere contingencia offline desde el día 1, se añade D11 a la ruta crítica y el bloque B del checklist físico pasa a ser obligatorio.

## 3. Fases

### Fase 0 — Decisiones humanas (ruta crítica, empieza hoy)

| # | Acción | Responsable | Salida verificable |
|---|---|---|---|
| 0.1 | Enviar al contador las 7 preguntas de `MATRIZ_DECISIONES_FISCALES_20261030.md` | Dueño | Respuesta escrita con fecha y nombre, registrada en la matriz |
| 0.2 | Mínimo para arrancar con el alcance de §2: **D1** (solo 15 %), **D3** (no hay exentos o no se venden en el piloto), **AUD-FIS-01** (qué documento se emite y texto legal exacto), **C-01** (tasa máxima de compras) | Contador | Filas marcadas como aprobadas en la matriz |
| 0.3 | Aprobar alcance del piloto (§2), RPO/RTO y consentimiento de datos reales | Dueño | Checklist F1, F5, F8 firmados |
| 0.4 | Decidir SDK OpenAI: retirar o mantener sin clave | Dueño | Decisión en el contexto maestro |

D2, D4–D10, C-02 y C-04 pueden quedar pendientes **solo** si el alcance de §2 se mantiene; cada una reaparece al activar la función que la necesita.

### Fase 1 — Cambios de código derivados (1–3 días tras Fase 0)

Rama propia desde `main`, PR con CI verde por SHA, merge con autorización.

1. **Comprobante de venta (AUD-FIS-01):** aplicar el texto aprobado en `frontend/src/components/ReciboPDF.tsx` (título actual «COMPROBANTE DE VENTA», sin CAI ni leyenda). Si el contador exige factura con CAI propia, es un desarrollo nuevo (rango, correlativo, vencimiento) y **retrasa la salida**; la alternativa rápida es comprobante interno con leyenda + factura externa (`referenciaFacturaExterna` ya existe en el esquema).
2. **C-01:** validar la tasa máxima de ISV de compras aprobada (hoy acepta 0–100 % del subtotal). Pruebas en `compras-isv`.
3. **OpenAI:** si se retira, eliminar `backend/src/ia/` y la dependencia `openai`; si no, dejarlo inerte.
4. **Observabilidad mínima** (no existe en el repositorio): monitor externo de disponibilidad sobre `/api/health/live` y `/api/health`, y alerta por correo al dueño. Sin dependencias nuevas en el código si se usa un servicio externo de *uptime*.
5. Preparar (sin fusionar) el PR que **retira el bloqueo de Vercel para `main`**; se fusiona solo en la ventana de Fase 5.

### Fase 2 — Conciliación de infraestructura (en paralelo a Fase 0; requiere persona con acceso a paneles)

| # | Panel | Acción | Valor esperado |
|---|---|---|---|
| 2.1 | Render | Start Command | `npm run start:prod` (verifica migraciones y no migra). Hoy: `npx prisma migrate deploy && node dist/main.js` — **migra en cada arranque; cambiar antes de cualquier despliegue** |
| 2.2 | Render | Pre-Deploy Command | Vacío |
| 2.3 | Render | Health Check Path | `/api/health/live` (propuesta registrada; `/api/health` reiniciaría el servicio ante cortes breves de la base). Hoy vacío |
| 2.4 | Render | Nombres de variables (no valores) | `NODE_ENV=production`, `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CONTINGENCIA_CLAVE_OPERACIONES` (≠ JWT), `FRONTEND_URLS`, `TRUST_PROXY=1`, `AUTH_MAIL_GMAIL_USER`, `AUTH_MAIL_GMAIL_APP_PASSWORD`. Ausentes: `POS_OFFLINE_ENABLED`, `FERRE_MIGRAR_AL_ARRANCAR`, `AUTH_ACEPTAR_TOKENS_SIN_SESION`, `SUPABASE_*`, `OPENAI_API_KEY` |
| 2.5 | Render | Auto-Deploy | Off (reconfirmar) |
| 2.6 | Vercel | `VITE_API_URL` | Production → API de producción con `/api`; Preview → API de preproducción |
| 2.7 | Vercel | Rama de producción | `main` |
| 2.8 | Supabase | Plan, respaldos diarios / PITR, retención | Registrado por escrito |
| 2.9 | Supabase | Historial de migraciones (solo lectura): `backend/scripts/estado-base-solo-lectura.sql` o `migration-safe.mjs inspect` | Sin `INCOMPLETA`, `CHECKSUM_DISTINTO` ni `DESCONOCIDA_EN_BASE`; lista de pendientes esperadas |
| 2.10 | Respaldo FS-41 | Destino independiente de Supabase, cifrado restic, frecuencia según RPO, retención | `backup-scheduler` activo y primer respaldo verificado |
| 2.11 | SMTP | Cuenta Gmail dedicada con 2FA; `SMTP_STAGING_CONFIRMAR=ENVIAR node backend/scripts/smtp-staging-check.mjs` a un buzón controlado | Correo recibido (autorización del dueño) |

### Fase 3 — Preproducción (3–5 días; obligatoria)

Proyecto Supabase, servicio Render y despliegue Vercel **separados**, con secretos distintos (`RUNBOOK_PREPRODUCCION_Y_PRODUCCION.md` §3A).

1. Cargar copia de producción (solo con autorización) o datos sintéticos de volumen representativo.
2. `estado-base-solo-lectura.sql` → `npm run migrate:deploy` una sola vez.
3. Desplegar el SHA candidato (main con Fase 1). Log `Nest application successfully started`.
4. `humo-preproduccion.mjs --escribe` → 22/22; reinicio y humo sin escritura.
5. **Ensayo con volumen** de `20261029000000_desglose_fiscal_linea` y de todas las migraciones pendientes respecto a producción: `respaldo-previo-migracion.sh` + `verificar-respaldo.sh --ensayo-migracion`.
6. **Restauración real** del respaldo FS-41 en una base nueva, midiendo tiempo (certifica RTO) y antigüedad del dato (certifica RPO).
7. Checklist físico A, C, D, E (y B si hay contingencia) contra preproducción con los equipos de la tienda.

Criterio de salida: humo 22/22, ensayo de migración sin pérdida de filas, restauración dentro del RTO, A2/C1/D1 aprobados.

### Fase 4 — Aceptación y preparación del negocio (en paralelo a Fase 3)

- Levantamiento de inventario real con el flujo de inventario inicial seguro.
- Alta de usuarios reales, roles y contraseñas; retiro de cuentas demo.
- Capacitación de administrador y cajeros en los equipos (F6); protocolo de apagón entregado (F7).
- Firmas F1–F8 del checklist de aceptación.

### Fase 5 — Ventana de producción (fuera de horario, caja del día cerrada)

Orden expresa del dueño para: merge del PR de Vercel, migración productiva y despliegue.

1. Respaldo manual verificado con ensayo de migración sobre la copia; si dice NO VERIFICADO, se aborta.
2. `estado-base-solo-lectura.sql` sobre producción.
3. Variables según 2.4 (guardar reinicia el servicio con el código actual; no pasa nada).
4. `DIRECT_URL=<prod> npm run migrate:deploy` desde máquina de confianza.
5. Manual Deploy del backend en Render; vigilar log y health check.
6. Merge del PR que retira el bloqueo de `main` en Vercel; desplegar frontend.
7. Humo de solo lectura (`humo-preproduccion.mjs` sin `--escribe`); una venta real de prueba solo si el dueño la autoriza.
8. Registrar SHA desplegado en Render y Vercel en el contexto maestro.

**Reversión** (runbook §5b): detener backend → restaurar respaldo → desplegar backend anterior → *Instant Rollback* en Vercel → humo. Disparadores: humo fallido, health check rojo > 5 min, error en cobro o caja.

### Fase 6 — Hiperatención (2 semanas)

- Revisión diaria: respaldo FS-41 verificado, cierre de caja sin diferencias inesperadas, logs de Render, monitor de disponibilidad.
- Canal directo cajero → dueño → desarrollo para incidencias; parches solo por PR con CI verde y despliegue manual.
- Al cierre: decidir activación de funciones aplazadas (contingencia D11, exentas D2–D10, contabilidad, comisiones con especificación).

## 4. Criterios GO (todos obligatorios)

1. Matriz fiscal: D1, D3, C-01 y AUD-FIS-01 aprobadas por escrito; comprobante actualizado y aprobado (F2, F3).
2. Render: Start Command `npm run start:prod`, Pre-Deploy vacío, health check configurado, variables completas.
3. Respaldo productivo independiente activo y una restauración real medida dentro de RPO/RTO (F5).
4. Preproducción: humo 22/22, ensayo de migraciones con volumen sin pérdida.
5. SMTP real verificado.
6. Checklist físico A2, C1, D1 aprobados; resto revisado con responsable.
7. Firmas F1–F8.
8. CI verde en el SHA exacto que se despliega.

## 5. Calendario orientativo

| Semana | Trabajo |
|---|---|
| 1 (3–7 nov) | Fase 0 enviada; Fase 2 completa; Fase 1 en cuanto llegue respuesta del contador |
| 2 (10–14 nov) | Fase 3 y Fase 4 en paralelo |
| 3 (17–21 nov) | Revisión GO/NO-GO; Fase 5 en ventana acordada |
| 4–5 | Fase 6 |

Riesgo principal: si el contador exige factura con CAI propia, se añade un desarrollo de 1–2 semanas antes de la Fase 3.

## Historial

- 2026-11-02: plan creado sobre `main` `c436592`, sin PR abiertos, ambos workflows en success. Fuentes: contexto maestro (fotografía 2026-10-31), `MATRIZ_DECISIONES_FISCALES_20261030.md`, `AUDITORIA_INFRAESTRUCTURA_20261030.md`, `CHECKLIST_FISICO_Y_ACEPTACION_20261030.md`, `RUNBOOK_PREPRODUCCION_Y_PRODUCCION.md`. Sin despliegues, paneles ni bases reales.
