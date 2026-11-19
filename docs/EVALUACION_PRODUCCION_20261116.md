# Evaluación de preparación para producción — Jowa System (2026-11-16)

> Evaluación, no autorización. No concede merge, despliegue, migración productiva ni cambios en paneles o bases reales. Sustituye como fotografía a las anteriores en lo que cambia; el plan de fases sigue siendo [PLAN_SALIDA_PRODUCCION_20261102.md](PLAN_SALIDA_PRODUCCION_20261102.md).

## Dictamen: NO-GO para la primera salida

El código de `main` está verde en CI y no encontré defectos P0 de código. El NO-GO se debe a requisitos que no se pueden verificar ni cerrar desde el repositorio: configuración real de Render, respaldos y restauración, preproducción, equipos físicos, aceptación del cliente y decisiones del dueño. Detalle en §3.

## 1. Estado verificado hoy

| Dato | Valor | Fuente |
|---|---|---|
| `main` | `5feae04d826d584a7f9fb0c3fc3b7d0c2f013f94` (merge de #247) | GitHub, 2026-11-16 |
| CI de `main` en ese SHA | «Operación de ferretería» y «Piloto con API y PostgreSQL reales»: success | Actions, runs 43632800878 y 43632800844 |
| PR abiertos | Solo #248 (borrador, rama `claude/affectionate-cori-pb4pv2`) | GitHub |
| #248 al iniciar | head `efd2aaa`, `validate`, `guard-base-datos` y `test` en verde, sin hilos de revisión, sin conflictos | GitHub |
| Ramas remotas | `main` y `claude/affectionate-cori-pb4pv2` | GitHub |
| Protección de `main` | `protected: false` | API de ramas |
| Producción conocida | Render y Vercel en `46f7db7` según la consulta del 2026-10-30. **No reconsultado:** esta sesión no tiene acceso a Render, Vercel ni Supabase | `AUDITORIA_INFRAESTRUCTURA_20261030.md` |
| Distancia producción → `main` | 142 commits y 2 migraciones (`20261113000000_solicitudes_autorizacion`, `20261114000000_reembolsos_devolucion`); 3 con #248 | `git diff 46f7db7..origin/main` |

Discrepancias entre documentos:

- `PLAN_SALIDA_PRODUCCION_20261102.md` §1 parte de `main` `c436592` y de una rama sin integrar; ambas cosas quedaron superadas (#234 y posteriores). Sus fases y criterios GO siguen vigentes; su punto de partida no.
- El plan dice que el ensayo pendiente es el de `20261029000000_desglose_fiscal_linea`. Esa migración ya está en `46f7db7`; las que hoy separan producción de `main` son las dos de la tabla. Si la base real las tiene aplicadas o no solo se sabe con `estado-base-solo-lectura.sql` (pendiente, B-03).
- Notion asigna la validación del RTN (etapa 4) a Codex; #245 no tiene todavía alcance ni criterios publicados para esa etapa.

## 2. Hallazgos de código

Prioridad: P0 impide operar o pierde dinero o datos; P1 riesgo alto para la primera salida; P2 debe resolverse o aceptarse por escrito; P3 mejora.

### 2.1 Corregidos en esta ronda

| ID | Prioridad | Hallazgo y evidencia | Impacto | Corrección | Criterio de aceptación |
|---|---|---|---|---|---|
| C-248-1 | P2 | Aprobaciones de apertura de caja reutilizables: cada `solicitudId` es otra entidad y nada invalidaba las solicitudes sobrantes. Prueba nueva fallaba en `efd2aaa` (`expected 'PENDIENTE' to be 'INVALIDADA'`) | Con apertura bajo autorización, un cajero podía abrir otro día con una aprobación antigua | #248, `d49bf2b`: `invalidarAperturasSobrantes` en `caja-control.ts` | Al pedir otra apertura o abrir, las demás solicitudes vivas de esa persona quedan INVALIDADAS con auditoría; las usadas no cambian |
| C-248-2 | P3 | `exigirAutorizacionCaja` no miraba al solicitante: otro usuario de la misma empresa con el mismo `solicitudId` invalidaba la pendiente ajena | Interferencia entre cajeros (requiere conocer el identificador) | #248, `d49bf2b` | 409 y la solicitud ajena sigue PENDIENTE |
| C-248-3 | P3 | Una solicitud de cierre seguía PENDIENTE con la caja ya cerrada (cambio de configuración antes de decidir) | Pendiente imposible de aprobar en el Inicio de los ADMIN | #248, `d49bf2b`: `invalidarCierresPendientes` | Tras cerrar, `autorizaciones_caja` no cuenta solicitudes de esa caja |
| T-06 | P3 | Mensajes de validación en inglés («motivo should not be empty»): 59 validadores sin mensaje propio solo en `operaciones.dto.ts` | El cajero ve errores en inglés | Esta rama: `ValidationPipeEnEspanol` traduce los textos por defecto; los mensajes propios no cambian | `POST` inválido responde 400 con `message[]` en español; prueba `mensajes-validacion.spec.ts` |
| T-07 | P3 | `GET /operaciones/productos/:id/historial` de un producto ajeno respondía 200 con listas vacías | Incoherencia; sin fuga de datos | Esta rama: 404 | Producto de otra empresa o inexistente → 404; prueba en `ventas.postgres.integration.ts` |
| T-02 | P1 (revisión de Codex) | `nodemailer` 10.0.16 con tres avisos moderados (análisis de direcciones) y, hasta 10.4.1, CVE-2026-125755: un espacio o un comentario junto al punto del dominio lo truncaba (`titular@negocio .ajeno.test` → `titular@negocio`) | El correo de seguridad podía ir a un buzón distinto | Esta rama: 10.4.1 (corrige el truncado; publicada el 2026-11-10). La 10.3.1 de la primera versión de este PR no lo corregía; `npm audit` no lo detecta porque el aviso no tiene versiones afectadas estructuradas | Regresión con la biblioteca real (`recovery-mail.service.spec.ts`), que falla con 10.3.1. El envío real sigue pendiente (B-06) |

### 2.2 Abiertos

| ID | Prioridad | Hallazgo y evidencia (verificada hoy salvo indicación) | Impacto | ¿Corregible por código? | Criterio de aceptación |
|---|---|---|---|---|---|
| A-01 | P1 | #248 sin integrar: `main` no tiene cierre ciego, autorización de caja ni saldo trasladable; tres supuestos sin confirmar | La caja de la primera salida depende de qué versión se despliegue | Código listo; falta decisión | Dueño confirma los tres supuestos; Codex revisa `d49bf2b` o posterior; CI verde en el SHA final |
| A-02 | P2 | Altas sin `solicitudId` (clientes, cotizaciones, duplicar cotización): `CreateClienteDto` y `CreateCotizacionDto` no lo tienen | Un reintento tras fallo de red crea un cliente o una cotización duplicados. No afecta dinero ni existencias | **Implementado en #251** (rama `claude/nifty-cannon-q0ourg`, 2026-11-18, base `main` tras #250, sin migración): `solicitudId` opcional en las tres altas y clave conservada por la pantalla; detalle en el contexto maestro | Repetir la misma solicitud devuelve el mismo registro; prueba de integración y E2E (añadidas). Pendiente: revisión e integración de #251 |
| A-03 | P2 | T-04: cotización con precio unitario libre. La conversión a venta lo rechaza (409) | Un cliente puede recibir una cotización que no se podrá vender | Sí, tras decidir la regla | Decisión del dueño: límite, autorización o permitirlo |
| A-04 | P2 | C-01: `compra()` acepta cualquier ISV entre 0 y el subtotal | Crédito fiscal mal registrado si compras alimenta libros | Sí, tras decidir la tasa | Decisión del contador; hasta entonces compras es solo registro de costo |
| A-05 | P3 | RTN del cliente sin formato (`create-cliente.dto.ts` solo limitaba el largo) | Dato fiscal sin validar | **Implementado en #250** (etapa 4, borrador): regla común en servidor y pantalla para clientes, ventas y cotizaciones | Auditoría de Codex y merge de #250; decisiones abiertas en su descripción (RTN del emisor, RTN heredados) |
| A-06 | P3 | Observaciones de #248 sin cambiar: recuento por `POST conteos` deja la solicitud de cierre PENDIENTE (aprobarla da 409); la caja sigue vendiendo mientras espera autorización de cierre; «Efectivo insuficiente» da una cota del esperado; `GET caja/cierres` lista 100 | Operativo, sin pérdida de dinero | Sí, si el dueño lo pide | Decisión del dueño por cada una |
| A-07 | P2 | Contingencia PWA: apagada por defecto (`contingencia.service.ts:100`). Sin separación física por empresa ni validación en equipos | Sin internet no se vende | Parcial | NO-GO propio de la contingencia; la primera salida es solo en línea (§3 del plan) |
| A-08 | P3 | SDK de OpenAI sin uso; inerte sin `OPENAI_API_KEY` | Dependencia innecesaria | Sí | Decisión del dueño: retirar o mantener |
| A-09 | P2 | Permisos efectivos mientras `permisosConfigurados` es falso y búsqueda de ventas ajenas para devoluciones. **Registrado el 2026-11-10; no reverificado hoy** | Alcance de datos por rol | Sí, tras decidir | Decisión del dueño |

Comprobado sin defecto en esta ronda (pruebas ejecutadas, no lectura de informes): aislamiento entre empresas y por rol (`aislamiento-barrido`, `aislamiento-roles-cruzados`), recuperación de cuenta y sesiones (`auth-recovery`), ventas, devoluciones, crédito e idempotencia (`ventas`), profundidad y tipo del cuerpo (`profundidad-maxima`), y la suite completa de integración sobre el código de #248 (§6).

## 3. Bloqueos que no son de código

| ID | Prioridad | Requisito | Estado | Responsable | Criterio de aceptación |
|---|---|---|---|---|---|
| B-01 | P0 | Render: arranque y salud | Observado el 2026-10-30: `npx prisma migrate deploy && node dist/main.js` (migra en cada arranque) y `healthCheckPath` vacío. **No reverificado** | Dueño | Start Command `npm run start:prod`, Pre-Deploy vacío, health check `/api/health/live`, Auto-Deploy Off; captura con nombres de variables, sin valores |
| B-02 | P0 | Respaldo independiente y restauración real | Herramienta probada solo en aislado; destino productivo sin configurar | Dueño / infraestructura | Respaldo FS-41 activo y una restauración cronometrada dentro del RPO/RTO aceptado |
| B-03 | P0 | Preproducción y ensayo de migraciones con datos representativos | No existe entorno de preproducción verificado | Dueño / NEXUS | `estado-base-solo-lectura.sql` sin `INCOMPLETA`, `CHECKSUM_DISTINTO` ni `DESCONOCIDA_EN_BASE`; `migrate:deploy` una vez; humo con escritura completo; ensayo sin pérdida de filas |
| B-04 | P0 | Equipos, periféricos y aceptación | Checklist físico sin ejecutar; sin firmas F1–F8; sin pruebas con usuarios reales | QA en sitio / cliente | A2, C1 y D1 aprobados en los equipos de la tienda; firmas F1–F8 |
| B-05 | P1 | Decisiones del dueño | Pendientes: alcance del §3 del plan (0.1), título del comprobante (0.5), RPO/RTO y uso de datos reales (0.7), tres supuestos de #248 | Dueño | Respuesta escrita en #245 o en el plan |
| B-06 | P1 | Correo real | Sin envío de prueba; `validarConfiguracionCorreo` solo valida forma | Dueño | `smtp-staging-check.mjs` con `SMTP_STAGING_CONFIRMAR=ENVIAR` a un buzón controlado |
| B-07 | P1 | Monitoreo y alertas | No hay nada en el repositorio (sin dependencias de monitoreo) | Dueño | Monitor externo sobre `/api/health/live` y `/api/health` con alerta |
| B-08 | P1 | Protección de `main` | `protected: false` | Dueño | PR obligatorio, checks `validate`, `test` y `guard-base-datos`, sin force push |
| B-09 | P1 | Variables de Render y Vercel | Sin verificar | Dueño | Lista de nombres según el plan §2.4 y §2.6 |
| B-10 | P2 | Vistas previas de Vercel | El bloqueo es por lista de ramas. La rama de #248 publicó vistas previas hasta que se bloqueó en `b17b4ca` (auditoría de Codex); la de esta evaluación queda bloqueada también en `vercel.json`. Las vistas previas ya publicadas siguen en línea y a qué API apunta `VITE_API_URL` en Preview no está verificado | Dueño | Retirar las vistas previas ya publicadas y confirmar que Preview no apunta a la API de producción, o bloquear por defecto |
| B-11 | P2 | Decisiones del contador | Nota de crédito de devoluciones; tratamiento contable de garantía, merma y reembolsos pendientes; C-01, C-02 y C-04 | Contador | Respuesta escrita. No bloquean mientras Contabilidad siga apagada, el primer cliente opere sin CAI y compras no alimente crédito fiscal |

## 4. Cobertura por área

| Área | Evidencia | Límite |
|---|---|---|
| Autenticación, permisos y tenant | Unitarias de `auth` 96/96; integración de recuperación, sesiones y aislamiento en verde | MFA, Super Admin e iPhone/Safari no probados en dispositivo |
| POS, cotizaciones, inventario, clientes | CI de `main` verde (E2E reales incluidos); suites de ventas y cotizaciones | Impresora, lector y cámara sin probar |
| Caja | `main`: caja anterior. #248: 15 pruebas de integración propias | Tres supuestos pendientes |
| Devoluciones y reembolsos | Etapa 2 en `main`, revisada por Codex en #247 | Documento fiscal y asiento: contador |
| Dinero, ISV y crédito | Centavos enteros, ISV 15 % sobre base gravada, paridad con SICOFI (`paridad-sicofi.spec.ts`) | Solo gravado 15 %; sin exentas |
| Idempotencia y auditoría | Ventas, pagos, caja, compras y devoluciones por `solicitudId`; `auditoria_operaciones`. Clientes, cotizaciones y copias: #251 | A-02 hasta integrar #251 |
| Migraciones | `verificar-migraciones`: correcto; ensayo de actualización y reversión en CI | Solo bases temporales (B-03) |
| Contingencia PWA | Apagada; pruebas simuladas | NO-GO propio (A-07) |
| Infraestructura | Solo lo que demuestra el repositorio | B-01, B-02, B-06, B-07, B-09 |

## 5. Etapa 4, RTN (implementada en #250, en revisión)

> Actualización del 2026-11-16: implementada en #250 con la regla de abajo, sin migración de datos heredados. RTN del emisor, proveedores y contingencia quedaron fuera. Lo que sigue es la propuesta original.

Es un pendiente válido con regla decidida por el dueño el 2026-11-12, pero no consta que sea requisito de la primera salida (el primer cliente opera sin CAI y el RTN es opcional), #245 no tiene alcance publicado y Notion la asigna a Codex. No se empezó.

- **Regla:** sin RTN, el campo queda vacío y la venta sigue. Con RTN, exactamente 14 dígitos; se aceptan separadores visuales y se guardan solo los dígitos; si no cumple, aviso y bloqueo hasta corregir. Valida formato, no existencia.
- **Alcance propuesto:** un validador común (hoy solo existe en `contabilidad/fiscal-hn`) usado por `CreateClienteDto`, `UpdateClienteDto`, el RTN escrito en la venta y en la cotización, y su espejo en el frontend.
- **Preguntas abiertas:** qué hacer con los RTN ya guardados que no cumplen (no se propone relleno ni migración); si el RTN del emisor (`configuracion.rtn`) sigue la misma regla.
- **Criterios:** `0801-1999-000001` se guarda como `08011999000001`; 13 o 15 dígitos y letras → 400 con mensaje en español; vacío → aceptado; clientes existentes siguen editables en sus demás campos.

## 6. Pruebas de esta ronda (Node 22.23.4, PostgreSQL 16 temporal, datos sintéticos)

Los resultados por SHA y los checks de GitHub constan en cada PR. Ninguna prueba tocó bases reales.

- **#248, código de `d49bf2b`:** backend build y lint sin errores; unitarias 870/870; `caja-etapa3` 15/15 (los tres casos nuevos fallaban antes del cambio); integración completa 77 archivos, 1321 aprobadas y 2 fallos esperados ya conocidos (Comisiones); `verificar-migraciones`: correcto, 1 migración nueva.
- **Esta rama:** resultados en el PR.
- **Fallo de entorno propio, no del producto:** al cambiar de rama el cliente Prisma quedó generado con el esquema de #248 y dos suites de aislamiento fallaron al preparar datos (`cajas.monto_trasladado does not exist`). Regenerado el cliente, pasaron.

## 7. Siguiente paso

> Actualización del 2026-11-16: #248 recibió y corrigió seis observaciones de Codex (head `b17b4ca`, CI verde) y #250 (etapa 4) está en revisión. El dictamen sigue siendo NO-GO por los bloqueos de §3.

1. Dueño: confirmar los tres supuestos de #248 y las decisiones 0.1, 0.5 y 0.7 del plan.
2. Codex: auditar #248 (`d49bf2b`) y el PR de esta rama.
3. Dueño, con acceso a paneles: B-01, B-08 y B-09 (capturas sin valores secretos), que no dependen de ningún merge.
4. Después: preproducción (B-03), respaldo y restauración (B-02), checklist físico (B-04) y nueva revisión GO/NO-GO.
