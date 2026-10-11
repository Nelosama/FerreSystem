# Integración temporal de #144 (cobro y entrega) y #145 (correcciones CENTINELA) — ATLAS, 2026-10-11

Rama `claude/atlas-integracion-144-145`. Base: `claude/centinela-verificacion-atlas` (contiene #145 `5be0d6ce` + las pruebas y el parche de Chromium de CENTINELA) + merge de `claude/atlas-cobro-entrega` (#144). Las ramas originales no se modificaron. Sin merge a `main`, despliegue ni migraciones productivas.

## Resolución de los 11 archivos en conflicto
| Archivo | Resolución |
|---|---|
| `backend/prisma/schema.prisma` | Se conservan ambos lados (modelos de autenticación/conciliación y de entregas); se restauró el cierre del modelo anterior. Después se modelaron en Prisma las claves compuestas `(tenant_id, …)` de la migración de entregas: deriva cero. |
| `operaciones.controller.ts` | `entregar` con `EntregarVentaDto` (#144) y `@Roles('ADMIN','BODEGUERO')`; `GET entregas` con usuario (R1). |
| `operaciones.service.ts` | `entregar` delegado al núcleo de #144 con `ROLES_ENTREGA`; `entregas(tenant, usuario)` conserva R1 sobre las cantidades de #144 (`reserva_pendiente`, `cantidad − entregada − cancelada`), con filtro de empresa también en clientes y productos; imports de ambos lados. |
| `ventas.service.ts` | Aprobación de precio de la base (`precioAprobado` **y** precio > 0, más estricta que la de #144) + modos de entrega + eventos de cobro + ids derivados (D3). La entrega inmediata (`MOSTRADOR`) exige rol que pueda entregar. |
| `migrations`, `piloto-flujo-completo`, `ventas.postgres` (pruebas) | Firma nueva de `entregar` (solicitud + receptor). |
| `reportes-zona-horaria`, `ventas.postgres` (listas de migraciones) | Unión de ambas listas en orden. |
| `docs/CONTEXTO_MAESTRO.md` | Ambas secciones. |
| `frontend/src/App.tsx`, `POSPage.tsx` | Rutas y POS de ambos lados (`pagoElectronico` + `modoEntrega`). |

## Reglas unificadas (una sola política en todas las superficies)
| Acción | ADMIN | BODEGUERO | CAJERO | VENDEDOR |
|---|---|---|---|---|
| Entregar (`/entregas/ventas/:id/entregas`, `/operaciones/ventas/:id/entregar`) y preparar | sí | sí | no (403) | no (403) |
| Liberar reserva | sí | no | no | no |
| Entrega inmediata en el POS (`modoEntrega: MOSTRADOR`) | sí | — (no vende) | no (403; cobra para bodega) | no (403) |
| Consultar pendientes (`/entregas/pendientes`, `/entregas/ventas/:id`, `/operaciones/entregas`) | todas | todas | solo sus ventas | sin acceso (403) |

Los permisos personalizados no elevan ni abren nada: ninguna ruta de entrega usa `RequiredPermission`, y las pruebas lo verifican con un cajero con todos los permisos. En el POS, el cajero ve un solo botón (cobra para bodega); el botón de entrega inmediata solo se muestra a ADMIN/BODEGUERO. Excepción documentada: la venta de contingencia sincronizada (hecho ya ocurrido en un equipo sin conexión) conserva su entrega.

## P3 — ids internos no son solicitudes
Los ids derivados por empresa llevan una etiqueta verificable en los 12 últimos dígitos (`esIdInterno`, `operaciones/ledger.ts`). Un `solicitudId` con esa forma se rechaza (400) y la consulta `GET /ventas/solicitudes/:id` lo trata como no registrado. Las rutas de recurso (`/solicitudes-devolucion/:id`, resolver contingencia) siguen aceptando el id de la lista. Los registros anteriores (id = solicitud) se siguen reconociendo. Coincidencia por azar de un UUID v4 de cliente: 2⁻⁴⁸.

## P2 — contingencia
`dispositivos_pos` y `operaciones_contingencia` usan id derivado por empresa. El equipo sigue enviando y recibiendo **su propio** identificador (las respuestas lo reflejan), por lo que el cliente offline no cambia: probado con dispositivo registrado antes del cambio (id crudo), reenvío de lote y estados. Un UUID de otra empresa responde igual que uno libre (201 / `REVISION`).

**Riesgos que no se eliminan:**
1. Un administrador de la propia empresa ve los ids internos en los listados (no es una fuga entre empresas).
2. Si se retira la columna de id crudo en el futuro habría que migrar los registros anteriores; hoy conviven.
3. Filas creadas por una compilación intermedia de #145 (`5be0d6ce`) con la fórmula sin etiqueta no se reconocen como internas; solo existen en entornos de prueba.
4. La señal de tiempo de respuesta (no medida) podría distinguir el camino de duplicado del de alta.

## Aislamiento por empresa
Auditoría de las superficies nuevas: se corrigió el `LEFT JOIN clientes` sin empresa de `entregas.service`; el resto de lecturas/escrituras filtra por `tenant_id` y las claves compuestas lo imponen en la base (eventos, líneas, movimientos y detalles). Prueba HTTP de matriz de roles × empresas en `backend/test/centinela-correcciones.postgres.integration.ts`.

## Esquema y NEXUS
La migración `20261012000000_entrega_eventos_y_cantidades` ahora modela en `schema.prisma` sus claves compuestas y únicos (deriva cero con `prisma migrate diff`; la prueba `esquema-deriva` pasa). Cambios respecto a #144: `detalles_venta.tenant_id` queda nullable en la base con `CHECK (tenant_id IS NOT NULL)` (el disparador lo completa; así los `create` anidados de Prisma no necesitan enviarlo). La propuesta de FK compuestas de NEXUS reutiliza `productos_tenant_id_id_key` y su rollback ya no la elimina.

## Pruebas (PostgreSQL 16 temporal, usuario `nobody`)
Ver el reporte del PR. Pruebas de CENTINELA: P3 y la contingencia pasan de `it.fails`/residual a aserciones de corrección.
