# Hallazgos — fases 4, 5 y 7 del sprint (2026-10-30)

Base: `origin/main` `a4ab291aba1a8574e9c66d59b044e35f938bda38`. Rama `claude/sprint-contingencia-seguridad-ux-20261030`.
Sin cambios en idempotencia ni cobro. No se tocó `docs/CONTEXTO_MAESTRO.md`. Sin merge, sin despliegue, sin bases reales.

## 1. Correcciones implementadas

| ID | Ámbito | Problema demostrado | Commit | Verificación |
|---|---|---|---|---|
| C-1 | Contingencia | Un 503 del servidor se mostraba como «Sin conexión con el servidor» (`sync.ts`), lo que lleva a revisar el internet en vez de esperar el reintento. Demostrado en navegador simulado: la prueba falla con el código anterior. | `50e02ac` | `offline-logica` 19/19; `contingencia-red-simulado` 3/3 (×3) |
| C-2 | Contingencia | Con dos pestañas, si la pestaña que cobra se cierra, la otra mantiene «Este POS está abierto en otra pestaña» hasta recargar. Causa: el bloqueo `navigator.locks` se pedía una sola vez. | `a5b1af3` | `contingencia-real` 5b: falla con el código anterior, pasa con la corrección; suite real 16/16 |
| C-3 | Seguridad | Barrido de aislamiento cruzado solo desde ADMIN y CAJERO. Se añade VENDEDOR, BODEGUERO y CONTADOR de otra empresa contra recursos reales de la empresa A. | `8d8da60` | `aislamiento-roles-cruzados` 7/7; sin fugas ni cambios en la huella de A |
| C-4 | Pruebas | Refactor del arnés de contingencia a `e2e/helpers/contingencia-sim.ts` sin cambio de comportamiento (17/17 antes y después). | `50e02ac` | `contingencia-simulado` + `offline-emulation` 17/17 |

## 2. Verificaciones sin defecto

- **Guards.** `RolesGuard` deja pasar un handler sin `@Roles`; todos los controladores de negocio declaran `JwtAuthGuard, TenantGuard, RolesGuard` a nivel de clase. Las rutas sin roles son las del barrido (`EXCEPCIONES_REVISADAS`), revisadas una a una.
- **`POST /admin/support/finalizar`** (solo `JwtAuthGuard`). Exige la marca de soporte del token, revoca solo la sesión propia y audita. No abre acceso cruzado.
- **`GET /tenant/logo`** (sin `@Roles`). Lee solo el logotipo del `tenantId` del token.
- **Rol de plataforma en guía.** Los tokens de plataforma llevan `rol: 'SUPER_ADMIN'`, así que el `@Roles` de `auth/guia` es coherente.
- **Consultas Prisma por `id` sin `tenantId`.** Revisadas las del código de negocio: las de `contingencia.service.ts`, `costo-inicial.service.ts` y `proveedores.service.ts` van precedidas de una lectura o de un bloqueo filtrado por tenant.
- **Sesiones, bloqueo, recuperación y MFA.** `autenticacion-fase3` 43/43, `seguridad-fase2` 16/16, `auth-recovery` 53/53, `admin-usuarios-soporte` 9/9, `aislamiento-barrido` 7/7 y `aislamiento-roles-cruzados` 7/7 en el head de la rama (135/135 en total). No se reintrodujo MFA.

## 3. Hallazgos pendientes (no corregidos aquí)

### Para Codex (idempotencia y transacciones centrales; no editado)

- **H-C1 (P2, defensa en profundidad).** `backend/src/ventas/ventas.service.ts:232`: `tx.venta.findUnique({ where: { id: derivado } })` no compara después `anterior.tenantId === tenantId`. El rama `crudo` sí lo hace (línea 235). Hoy no es explotable: el identificador derivado incluye el tenant. Impacto si un id ajeno llegara a existir: la idempotencia devolvería una venta de otra empresa. Propuesta: añadir la comparación de `tenantId` también al resultado derivado.

### Para desarrollo frontend (sin corregir en esta rama por tamaño)

- **H-F1 (P2).** `frontend/src/offline/sync.ts`, `sincronizarPendientes`: si una escritura local falla después de recibir la respuesta del servidor, el `catch` del lote vuelve a `PENDIENTE` también las operaciones que ya estaban `SINCRONIZADAS` en ese lote. Efecto: el reenvío es idempotente por UUID, así que no duplica ventas en el servidor, pero la interfaz puede mostrar temporalmente como pendientes operaciones confirmadas. Propuesta: no reescribir las operaciones ya confirmadas en el `catch`.

## 4. Decisiones humanas

Ninguna para estos cambios. Las decisiones fiscales, de Comisiones y de infraestructura siguen en la lista de #227, #228 y #229.

## 5. Revisión de la fase 7

Las pruebas existentes de navegación, POS, cotizaciones y contingencia pasan en escritorio y móvil (ver el PR). No se hizo un recorrido exploratorio manual nuevo de todos los flujos; los defectos de UX corregidos son los demostrados arriba.
