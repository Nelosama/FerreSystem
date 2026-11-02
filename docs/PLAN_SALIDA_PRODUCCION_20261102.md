# Plan de salida a producción — Jowa System 1.0 (actualizado 2026-11-02)

> Plan, no autorización. Ningún paso de este documento concede merge a `main`, despliegue, migración productiva, lectura de bases reales, cambio de paneles ni envío de correo: cada uno requiere la orden expresa del dueño. Las fechas son estimaciones de ingeniería; la ruta crítica depende de accesos a paneles y de la preproducción.

## 1. Punto de partida (comprobado el 2026-11-02)

- **`main`** = `c436592f3df5e889c69d1eee0d35e8e505cb4bb7` (merge de #232). Ambos workflows en **success** en ese SHA: [Operación de ferretería 41174096543](https://github.com/Nelosama/FerreSystem/actions/runs/41174096543) y [Piloto con API y PostgreSQL reales 41174096545](https://github.com/Nelosama/FerreSystem/actions/runs/41174096545). **No hay PR abiertos.**
- **Rama de trabajo** `claude/sweet-ritchie-wrwsbo`: 6 commits sobre `main` (hasta `e67c49a`), todavía **no integrados en `main`**. Contiene: cálculo del ISV de cotizaciones, comprobante de venta sin CAI, corrección de la prueba de Contabilidad, diseño de facturación CAI y comparación con SICOFI. Vercel bloquea esta rama por `frontend/vercel.json`.
- **Evidencia local de la rama** (`e67c49a`): backend unitarias 842/842; frontend 591/591, compila y lint sin errores; integración PostgreSQL de cotizaciones, ventas, crédito, exenciones, aislamiento y contabilidad: 329 aprobadas, 1 omitida, 2 fallos esperados. **Suite completa de integración: pendiente de resultado** (en curso al cierre de este documento). Un head distinto de `e67c49a` requiere sus propios resultados.
- **Producción actual:** Render y Vercel sirven `46f7db7` (anterior a #225–#232). Render con Auto-Deploy Off (consulta 2026-10-30); Vercel bloquea `main` y las ramas de trabajo.
- **Dictamen vigente: NO-GO.** Lo que falta ya no es el cálculo fiscal del piloto: son infraestructura sin verificar, respaldos reales, preproducción, equipos físicos y aceptación del cliente.

## 2. Decisiones del dueño ya tomadas

| Fecha | Decisión | Efecto en el plan |
|---|---|---|
| 2026-11-02 | La referencia fiscal es **SICOFI como inspiración**, no como sistema de conciliación | No se requieren datos reales de SICOFI para salir. Sus defectos conocidos no se copian |
| 2026-11-02 | **Contabilidad es servicio de pago**: sin contratarla, queda apagada y el cliente la lleva a mano | Ya implementado (opt-in en `tenant-modules.ts`); no bloquea la salida |
| 2026-11-02 | **Piloto: solo 15 %**, sin productos exentos, ISV calculado **una vez sobre la base gravada total** | Cotizaciones corregidas en `e67c49a` para cumplirlo |
| 2026-11-02 | **Primer cliente sin CAI**: el documento es comprobante, en formato de factura, **sin línea de CAI ni leyenda** | La facturación con CAI no bloquea la salida |
| 2026-11-02 | **CAI** (cuando exista): lo registra el **ADMIN**, que puede dar el permiso al contador; el Super Admin solo asiste | Diseño en [DISENO_FACTURACION_CAI_20261102.md](DISENO_FACTURACION_CAI_20261102.md) |

## 3. Alcance del primer arranque

| Incluido | Excluido / apagado |
|---|---|
| POS en línea, cotizaciones (solo 15 %), inventario, precios y kardex, levantamiento, clientes y crédito, proveedores, caja, entregas, devoluciones gravadas, usuarios, Super Admin, reportes de resumen, comprobante de venta sin CAI | Exenciones (bloqueadas para todos), desglose por línea (`FISCAL_DESGLOSE_POR_LINEA` apagado), Contabilidad (servicio de pago, apagada), Comisiones (excluido), apartados, transferencias, pedidos especiales y listas de precio (ocultos), **contingencia offline apagada** (`POS_OFFLINE_ENABLED` sin definir), facturación con CAI (servicio posterior), `OPENAI_API_KEY` sin cargar |

Si el dueño quiere la contingencia offline desde el día 1, el bloque B del checklist físico pasa a ser obligatorio y la decisión D11 entra en la ruta crítica.

## 4. Fases

### Fase 0 — Decisiones pendientes del dueño (no bloquean la preproducción salvo las marcadas)

| # | Decisión | Bloquea la salida | Por defecto si no se decide |
|---|---|---|---|
| 0.1 | Aprobar el alcance de §3 (checklist F1) | Sí | — |
| 0.2 | **C-01:** tasa máxima de ISV en compras. Hoy el sistema acepta de 0 a 100 % del subtotal | Sí, si compras alimenta el crédito fiscal | Bloquear ISV de compras por encima de 15 % del subtotal y exigir revisión manual |
| 0.3 | **C-02 / C-04:** compras sin desglose por línea ni conciliación con libros | Sí, si compras alimenta el crédito fiscal | Compras solo como registro de costo, sin crédito fiscal, hasta el cierre del periodo |
| 0.4 | **RTN del emisor** en el comprobante (campo opcional, ver §4.1 punto 3) | No | Sin RTN; se añade cuando el cliente lo pida |
| 0.5 | Título del comprobante: «COMPROBANTE DE VENTA» (propuesta) o «FACTURA» | Sí, antes de vender | Mantener «COMPROBANTE DE VENTA» |
| 0.6 | SDK OpenAI: retirar o mantener sin clave | No | Mantener sin clave (inerte) |
| 0.7 | RPO y RTO aceptados; consentimiento para datos reales | Sí (F5, F8) | — |

Las decisiones D2, D5, D7–D11 y C-02/C-04 solo bloquean si se activa la función que las necesita (exentas, contingencia, Contabilidad, compras como crédito fiscal). Se reabren al activar cada una.

### Fase 1 — Cambios de código para la salida

Ya hecho en `claude/sweet-ritchie-wrwsbo` (no integrado aún):

- ISV de cotizaciones una vez sobre la base gravada (`backend/src/common/isv-documento.ts`, espejo en `frontend/src/utils/isv-documento.ts`).
- Comprobante de venta con formato de factura sin CAI: desglose exento/gravado, cantidad en letras, sin leyenda (`frontend/src/components/ReciboPDF.tsx`, `frontend/src/utils/montoEnLetras.ts`).
- Prueba de Contabilidad corregida para calcular el mes en curso (fallaba desde el 1 de noviembre también en `main`).

Pendiente de código:

1. **Integrar la rama en `main`** con PR, CI verde en el SHA exacto y autorización del dueño. No se abre PR sin orden expresa.
2. **C-01 y C-02/C-04** según la decisión de la Fase 0 (limitar el ISV de compras; si aplica, pruebas en `compras-isv`).
3. **RTN opcional del emisor** (si el cliente lo pide): campo en la configuración de la empresa, impresión solo si tiene valor, y copia del RTN en cada venta al emitirla para que las reimpresiones no cambien. La copia requiere columna nueva en ventas: revisión NEXUS. Estimado 2–3 horas.
4. **OpenAI:** si se retira, eliminar `backend/src/ia/` y la dependencia `openai`.
5. **Observabilidad mínima** (no existe en el repositorio): monitor externo de disponibilidad sobre `/api/health/live` y `/api/health`, con alerta por correo al dueño.
6. **Preparar, sin fusionar**, el PR que retira el bloqueo de Vercel para `main`; se fusiona solo en la Fase 5.

### Fase 2 — Conciliación de infraestructura (en paralelo; requiere persona con acceso a paneles)

| # | Panel | Acción | Valor esperado |
|---|---|---|---|
| 2.1 | Render | Start Command | `npm run start:prod` (verifica migraciones, no migra). Hoy: `npx prisma migrate deploy && node dist/main.js`, que **migra en cada arranque** |
| 2.2 | Render | Pre-Deploy Command | Vacío |
| 2.3 | Render | Health Check Path | `/api/health/live` (propuesta). Hoy vacío |
| 2.4 | Render | Nombres de variables (no valores) | Presentes: `NODE_ENV=production`, `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CONTINGENCIA_CLAVE_OPERACIONES` (distinta de `JWT_SECRET`), `FRONTEND_URLS`, `TRUST_PROXY=1`, `AUTH_MAIL_GMAIL_USER`, `AUTH_MAIL_GMAIL_APP_PASSWORD`. Ausentes: `POS_OFFLINE_ENABLED`, `FERRE_MIGRAR_AL_ARRANCAR`, `AUTH_ACEPTAR_TOKENS_SIN_SESION`, `SUPABASE_*`, `OPENAI_API_KEY` |
| 2.5 | Render | Auto-Deploy | Off (reconfirmar) |
| 2.6 | Vercel | `VITE_API_URL` | Production → API de producción con `/api`; Preview → API de preproducción |
| 2.7 | Vercel | Rama de producción | `main` |
| 2.8 | Supabase | Plan, respaldos diarios / PITR, retención | Registrado por escrito |
| 2.9 | Supabase | Historial de migraciones (solo lectura): `backend/scripts/estado-base-solo-lectura.sql` o `migration-safe.mjs inspect` | Sin `INCOMPLETA`, `CHECKSUM_DISTINTO` ni `DESCONOCIDA_EN_BASE` |
| 2.10 | Respaldo FS-41 | Destino independiente, cifrado restic, frecuencia según RPO | `backup-scheduler` activo y primer respaldo verificado |
| 2.11 | SMTP | Cuenta Gmail dedicada con 2FA; prueba con `SMTP_STAGING_CONFIRMAR=ENVIAR` a un buzón controlado | Correo recibido (autorización del dueño) |

### Fase 3 — Preproducción (3–5 días; obligatoria)

Proyecto Supabase, servicio Render y despliegue Vercel **separados**, con secretos distintos (`RUNBOOK_PREPRODUCCION_Y_PRODUCCION.md` §3A).

1. Cargar datos sintéticos de volumen representativo (o copia de producción solo con autorización).
2. `estado-base-solo-lectura.sql` → `npm run migrate:deploy` una sola vez.
3. Desplegar el SHA candidato (main con Fase 1). Log `Nest application successfully started`.
4. `humo-preproduccion.mjs --escribe` → 22/22; reinicio y humo sin escritura.
5. **Ensayo con volumen** de `20261029000000_desglose_fiscal_linea` y de las migraciones pendientes: `respaldo-previo-migracion.sh` + `verificar-respaldo.sh --ensayo-migracion`.
6. **Restauración real** del respaldo FS-41 en una base nueva, midiendo tiempo (RTO) y antigüedad del dato (RPO).
7. Checklist físico A, C, D, E (y B si hay contingencia) con los equipos de la tienda.

Criterio de salida: humo 22/22, ensayo de migración sin pérdida de filas, restauración dentro del RTO, A2/C1/D1 aprobados.

### Fase 4 — Preparación del negocio (en paralelo con Fase 3)

- Inventario real con el flujo de inventario inicial seguro.
- Usuarios reales, roles y contraseñas; retiro de cuentas demo.
- Capacitación de administrador y cajeros en los equipos (F6); protocolo de apagón entregado (F7).
- Firmas F1–F8 del checklist de aceptación.

### Fase 5 — Ventana de producción (fuera de horario, caja del día cerrada)

Orden expresa del dueño para: merge a `main`, merge del PR de Vercel, migración productiva y despliegue.

1. Respaldo manual verificado con ensayo de migración sobre la copia; si dice NO VERIFICADO, se aborta.
2. `estado-base-solo-lectura.sql` sobre producción.
3. Variables según 2.4 (guardar reinicia el servicio; con el código actual no pasa nada).
4. `DIRECT_URL=<prod> npm run migrate:deploy` desde máquina de confianza.
5. Manual Deploy del backend en Render; vigilar log y health check.
6. Merge del PR que retira el bloqueo de `main` en Vercel; desplegar frontend.
7. Humo de solo lectura (`humo-preproduccion.mjs` sin `--escribe`); una venta real de prueba solo si el dueño la autoriza.
8. Registrar SHA desplegado en Render y Vercel en el contexto maestro.

**Reversión** (runbook §5b): detener backend → restaurar respaldo → desplegar backend anterior → *Instant Rollback* en Vercel → humo. Disparadores: humo fallido, health check rojo más de 5 minutos, error en cobro o caja.

### Fase 6 — Estabilización (2 semanas)

- Revisión diaria: respaldo FS-41 verificado, cierre de caja sin diferencias inesperadas, logs de Render, monitor de disponibilidad.
- Canal directo cajero → dueño → desarrollo para incidencias; parches solo por PR con CI verde y despliegue manual.
- Servicios posteriores, en orden de demanda: **facturación con CAI** (`facturacion_cai`, 1–2 semanas, NEXUS), RTN del emisor si no entró antes, Contabilidad para clientes que la contraten, exentas (D2–D10) y Comisiones (requiere especificación).

## 5. Criterios GO (todos obligatorios)

1. Alcance de §3 aprobado por el dueño (F1).
2. Decisiones de la Fase 0 marcadas como bloqueantes resueltas por escrito (0.1, 0.2, 0.3 y 0.5 según corresponda; 0.7).
3. Rama de trabajo integrada en `main` con CI verde en el SHA exacto que se despliega (incluye la suite de integración completa).
4. Render: Start Command `npm run start:prod`, Pre-Deploy vacío, health check configurado, variables completas.
5. Respaldo productivo independiente activo y una restauración real medida dentro de RPO/RTO (F5).
6. Preproducción: humo 22/22 y ensayo de migraciones con volumen sin pérdida.
7. SMTP real verificado.
8. Checklist físico A2, C1, D1 aprobados; el resto revisado con su responsable.
9. Firmas F1–F8.

## 6. Calendario orientativo

| Semana | Trabajo |
|---|---|
| 1 (3–7 nov) | Decisiones de la Fase 0; integrar la rama en `main` con autorización; Fase 2 (accesos a paneles) |
| 2 (10–14 nov) | Fase 3 y Fase 4 en paralelo; monitor de disponibilidad y OpenAI |
| 3 (17–21 nov) | Revisión GO/NO-GO; Fase 5 en ventana acordada |
| 4–5 | Fase 6 |

Riesgos principales:
- **Accesos a paneles** (Render, Vercel, Supabase): sin ellos, la Fase 2 no se cierra y la salida no tiene fecha.
- **Compras como crédito fiscal** (C-01/C-02/C-04): si el dueño quiere usarlo desde el día 1, añade trabajo; el valor por defecto de la Fase 0 lo evita.
- **Facturación con CAI para el primer cliente**: el primer cliente no la necesita; si cambia, añade 1–2 semanas antes de la Fase 3.

## Historial

- 2026-11-02: plan creado sobre `main` `c436592`, sin PR abiertos, ambos workflows en success.
- 2026-11-02: comparación de reglas contra SICOFI; prueba `backend/src/common/paridad-sicofi.spec.ts` 3/3.
- 2026-11-02: SICOFI pasa a inspiración; Contabilidad confirmada como servicio de pago; documento de venta configurable por empresa.
- 2026-11-02: decisiones del dueño (CAI por ADMIN, primer cliente sin CAI, formato sin leyenda, reglas del piloto); cambios en `e67c49a`.
- 2026-11-02: plan actualizado: decisiones tomadas, pendientes reales, fases y criterios GO revisados. Sin despliegues, paneles, bases reales ni merges.
