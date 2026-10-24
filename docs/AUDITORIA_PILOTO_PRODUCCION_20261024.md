# Auditoría de preparación para piloto en una ferretería real — 2026-10-24

Rama `claude/kind-pasteur-ilo43m` sobre `main` `01f9110a` (incluye #194). Sin cambios de código de producto, interfaz, infraestructura, esquema ni reglas comerciales. #180 y el trabajo de Codex no se tocaron. Sin merge ni despliegue. Todas las pruebas se ejecutaron contra clústeres PostgreSQL 16 **temporales** creados por las propias pruebas; ninguna lee `DATABASE_URL` ni toca una base compartida o de producción.

## Resultado

**Dictamen: APTO CON CONDICIONES para un piloto acotado** (una sucursal operativa, caja por cajero, supervisión del administrador y los controles de la sección «Condiciones»). No se encontró ningún defecto de código en el alcance, por lo que **no se corrigió ni cambió código del producto**. Esto no certifica producción general: los riesgos de la última sección siguen abiertos.

## Qué se añadió (solo pruebas)

| Archivo | Contenido |
|---|---|
| `backend/test/auditoria-piloto-ferreteria.postgres.integration.ts` | 40 escenarios contra PostgreSQL real (servicios NestJS + cadena completa de migraciones). |
| `frontend/e2e-real/auditoria-jornada-piloto-real.spec.ts` | 8 pasos de jornada completa: login en navegador → apertura → ventas → crédito → abonos → compra y pago a proveedor → ataques HTTP → arqueo en pantalla → cierre → conciliación SQL. API NestJS y PostgreSQL reales, sin mocks. |

## Escenarios probados por área

**1. Ventas.** Contado en efectivo con ISV 15 % exacto; redondeo mitad hacia arriba con descuento (7×0.35 + 3×12.50 − 1.00 → 39.95 / 5.84 / 44.79); cantidades decimales; descuento de cajero en el límite (10 %) y un centavo por encima (403), descuento del ADMIN, descuento mayor al subtotal/negativo/que anula el total; cajero sin `pos.aplicar_descuento`; tarjeta y transferencia con autorización obligatoria, terminal obligatoria en tarjeta, autorización no reutilizable; método inválido, tipo/método contradictorios, líneas repetidas, cantidades 0/negativas/NaN/0.001; crédito sin cliente, con cliente sin crédito, límite exacto al centavo, CxC con vencimiento por plazo; venta sin caja abierta; comprobante (número, líneas, RTN) y aislamiento por cajero; numeración sin huecos tras intentos fallidos. **Estrés monetario:** 300 ventas aleatorias (semilla fija) comparadas al centavo con un cálculo independiente en enteros; la caja cuadra y el cierre da diferencia 0.

**2. Inventario.** Producto sin existencia y límite exacto; 3 ventas de 0.1 sobre 0.3 (sin error de coma flotante); producto inactivo, ajeno o sin precio aprobado; precio manipulado (cajero 409, ADMIN permitido); ciclo reserva → entrega (descuento físico una sola vez, kardex −4: 50→46); ajuste (solo ADMIN/BODEGUERO, existencias vistas obligatorias, idempotente, no baja de lo reservado, otra empresa no encuentra el producto); recepciones y costo vigente (costo sube/baja con la última recepción).

**3. Caja.** Jornada completa efectivo/tarjeta/transferencia/crédito/abono/entrada/salida; efectivo esperado = fondo + solo efectivo; faltante exige explicación (servidor y pantalla); cierre idéntico repetido inocuo, distinto → 409; sin ventas ni cobros tras cerrar; salida manual con permiso, sin dejar negativo, idempotente; **pago a proveedor (CxP) en cualquier método no abre ni mueve la caja** (verificado también con API real: 0 movimientos `PAGO_CXP`); cada cajero solo ve y cierra su caja; otra empresa no cierra ni consulta cajas ajenas; **cierre concurrente con 6 ventas y 3 abonos:** ningún movimiento posterior al cierre y esperado igual a la suma de movimientos.

**4. Compras.** Factura → recepción parcial/total → costo vigente; pagos con referencia, mismo pago reenviado no se duplica, misma referencia en la factura rechazada, mismo `solicitudId` con otro monto rechazado, pago mayor al saldo rechazado, saldo exacto a 0; factura duplicada (mayúsculas/espacios) → 409; proveedor/producto ajeno → rollback sin huella; cantidades/costos inválidos; CAJERO no compra ni paga; BODEGUERO recibe pero no paga; vencimientos/estado `VENCIDA`.

**5. Crédito.** Abonos parciales 100.55 + 0.45 + 129 hasta 0 (CxC, saldo del cliente y saldo de la venta coinciden); reintento idempotente; sobrepago rechazado; ruta heredada de abonos bloqueada; invariante saldo cliente = suma de CxC; sin saldos negativos.

**6. Permisos.** Empresa B no ve, paga, cierra ni vende con datos de A (servicio y HTTP real); sin token y token basura → 401; cajero sin acceso a resumen, cierres, usuarios, CxP, compras ni devoluciones directas; bodeguero sin acceso a ventas; cajero 2 no ve ventas ni caja del cajero 1; asignación masiva (`total`, `isv`, `tenantId`, `usuarioId`, `estado`, `cajaId`) ignorada.

**7. Integridad.** Nueve operaciones fallidas distintas (segunda línea sin stock/inexistente, tarjeta sin terminal, crédito sin cliente o sobre el límite, descuento excesivo, precio manipulado, rol sin permiso, cuenta inexistente) dejan idénticos ventas, detalles, caja, CxC, pagos, aprobaciones, kardex, stock, reservas, saldos y secuencia; misma solicitud con otro contenido → conflicto; 10 envíos simultáneos de la misma solicitud → 1 venta; 8 cajeros sobre el último stock → sin sobreventa y numeración 1,2,3; conciliación caja/kardex/ventas.

**8. E2E.** Ver resultados: jornada propia (8/8) y piloto real completo (162).

## Resultados de pruebas

| Suite | Resultado |
|---|---|
| Integración PostgreSQL completa (`npm run test:integration`), con los 40 nuevos | **64 archivos, 1093 aprobadas / 0 fallidas / 1 omitida** (omitida preexistente, opt-in) |
| Misma suite antes de añadir pruebas (línea base de `main`) | 63 archivos, 1053 aprobadas / 0 fallidas / 1 omitida |
| Unitarias backend | 57 archivos, 581/581 |
| Piloto real completo `e2e-real` (API NestJS + PostgreSQL + Chromium 153) | **162 aprobadas / 0 fallidas / 4 omitidas** (omitidas heredadas: entrega parcial, canal web ×2, integración de datáfono; documentadas como pendientes del propietario) |
| Jornada propia `auditoria-jornada-piloto-real` | 8/8 |
| Fallos | Ninguno del producto. Durante la escritura, 9 fallos de la **prueba nueva** (caja del ADMIN sin abrir, nombre de tabla, firma de método, expectativa de reentrega idempotente, un caso de costo 0). Ninguno reveló un defecto; se corrigieron las pruebas. |

No ejecutado: unitarias de frontend ni suite simulada de navegador (sin cambios de frontend), dispositivos físicos, Safari/iPhone, impresoras, lector, Vercel/Render.

## Errores encontrados y corregidos

Ninguno en el producto. Observaciones (no son defectos; son decisiones vigentes que conviene confirmar):

1. **Sucursales solo como catálogo.** `Sucursal` es administrativa («No reasigna ventas, existencias, cajas ni operaciones», `schema.prisma`). Ventas, inventario y cajas se aíslan por negocio (`tenant_id`) y por cajero, **no por sucursal**. No hay aislamiento operativo entre sucursales porque no existe; es una limitación de diseño, no una regresión.
2. **Compras con costo 0** permitidas por diseño (`@Min(0)` en `CompraItemDto`); al recibir fijan el costo vigente en 0 y distorsionan el margen. Cubierto por el control del administrador.
3. **Cierre solo por su titular.** `cerrar` exige `usuario_id` igual al actor y no hay cierre forzado por el ADMIN. Si un cajero es desactivado o se va con la caja abierta, esa caja queda abierta y sin conciliar hasta intervención manual en base de datos.

## Riesgos que impiden una salida general a producción

1. Hardware sin certificar: iPhone/Safari/PWA instalada, impresoras 58/80 mm, lector de código de barras, tableta física (pendiente del contexto maestro).
2. Despliegue no verificado en esta auditoría: variables de Render (`NODE_ENV`, `JWT_SECRET`, `TRUST_PROXY`, `FRONTEND_URLS`), respaldo antes de `migrate deploy`, Vercel con cabeceras reales y cookies de refresco entre sitios distintos.
3. Operación multisucursal no soportada (observación 1) y caja huérfana sin cierre forzado (observación 3).
4. Cobro incierto sin conexión requiere conexión para resolverse; recuperación local corrupta requiere conciliación manual (pendientes de #194).
5. Aceptación del cliente y datos reales (catálogo, precios aprobados, clientes) sin validar; la auditoría usa datos sintéticos.
6. #180 (contabilidad/fiscalidad) separado y no evaluado: no se certifica emisión fiscal (CAI/numeración fiscal), solo el comprobante interno existente.

## Condiciones para el piloto

Una sucursal operativa; un cajero por caja abierta y cierre diario obligatorio por su titular; ADMIN revisa `GET /operaciones/caja/cierres` al terminar el día; costos de compra revisados por el ADMIN; respaldo de base de datos antes de cualquier despliegue; no usar varias sucursales como unidades operativas; contingencia offline solo con conexión disponible para sincronizar.

## Cómo reproducir

```bash
# Backend (como root: envolturas initdb/pg_ctl con runuser nobody, ver CONTEXTO_MAESTRO)
cd backend && PG_BIN=<envolturas> TMPDIR=/var/tmp/ferre-pg npx vitest run --config ./vitest.config.integration.ts test/auditoria-piloto-ferreteria.postgres.integration.ts
# Piloto real (levanta su propio PostgreSQL temporal)
cd frontend && e2e-real/run.sh e2e-real/auditoria-jornada-piloto-real.spec.ts
```

Firma de la evidencia PostgreSQL temporal: **NEXUS** (sin cambios de esquema ni migraciones).
