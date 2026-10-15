# Administración — correcciones de la auditoría (rama `fix/auditoria-admin`, 2026-10-13)

Alcance: hallazgos administrativos y de seguridad de `auditoria_ferresystem.md` (soporte remoto, usuarios, sucursales, permisos y calidad).
Sin merge, sin despliegue, sin migraciones productivas, sin datos reales modificados. Todas las pruebas de base de datos usan un clúster PostgreSQL 16 temporal ejecutado como usuario sin privilegios.

## 1. Hallazgos y estado

| Hallazgo (auditoría) | Estado | Evidencia |
|---|---|---|
| [P1] "Iniciar Soporte Remoto" devuelve 404 | **Corregido** | Causa raíz: el endpoint sí existe (`POST /api/admin/support/token`). El modal enviaba IDs ficticios (`usr-admin-1`); el servicio respondía correctamente "Usuario o ferretería no disponible". Ver §2. |
| [P1] Usuarios de soporte hardcodeados (Carlos Ramos, @lamundial.hn) | **Corregido** | Lista real: `GET /admin/tenants/:id/usuarios`. Sin datos de demostración en `SuperAdminPage`. |
| Historial de soporte y fin de sesión en `localStorage` | **Corregido** | `GET /admin/soporte/trazas`; el fin de sesión revoca en servidor (`POST /admin/support/finalizar`). |
| [P2] No hay forma de eliminar/desactivar usuarios | **Corregido como eliminación lógica** | `DELETE /usuarios/:id` desactiva (sin borrado físico), `PUT {activo}` reactiva. Botones con confirmación en `UsuariosPage`. |
| [P2] Sucursales: no hay eliminar ni desactivar | **Bloqueado** | No existe modelo de sucursal en Prisma (ver §4). |
| Selector de sucursal con opciones fijas en Usuarios (FS-17) | **Corregido** | Se retiró; no se muestra una sucursal inventada. |
| "TOTAL SUCURSALES CONECTADAS" (1 por empresa) | **Corregido** | Sumaba `sucursalesCount || 1`, dato inexistente. Ahora "No disponible". |
| Login: bloqueo tras intentos fallidos | Fuera de este PR | Ya implementado en la fase 3 (`auth/login-rate-limit.ts`); no se modificó. |
| [P0] Importación CSV pierde precios; [P1] validación CSV | Fuera de alcance | Pertenece a otro agente (inventario/importación). No se tocó. |

## 2. Causa raíz del soporte remoto

1. El frontend (`SuperAdminPage.tsx`) listaba cuatro usuarios de demostración en el código. Sus IDs no existen en la base.
2. El backend validaba correctamente (`usuario` con `tenantId` y `activo`) y respondía 404 con el mensaje visible en el banner.
3. Historial y fin de sesión dependían de `ferre_mock_auditoria_soporte` (localStorage), no de la auditoría durable.
4. El token de soporte no se revocaba al salir: quedaba válido hasta su vencimiento (15 min en solo lectura, 10 min en escritura).

## 3. Controles de soporte (infraestructura reutilizada)

Se reutilizó la infraestructura existente: `SuperAdminService.supportToken`, `JwtStrategy` (sesión `sid` revocable, super admin activo revalidado), `TenantGuard` (solo lectura), `SupportAuditInterceptor` y `auditoriaOperacion`.

Añadido:
- `GET /admin/tenants/:id/usuarios` (SUPER_ADMIN): usuarios activos, solo `id, nombre, email, rol`; sin hash ni permisos.
- `POST /admin/support/finalizar`: revoca el `sid` de la sesión de soporte y audita `SOPORTE_FINALIZAR` (identidad original, empresa, modo, `soporteSesionId`). Es la única ruta de escritura permitida en solo lectura, por metadato explícito `@PermiteSoporteSoloLectura()`.
- `GET /admin/soporte/trazas` (SUPER_ADMIN): inicio, fin, modo, motivo, identidad original y escrituras auditadas, filtrable por empresa y limitada a 200 filas.
- `JwtStrategy` expone `sid` (antes no llegaba al handler, y la revocación no se ejecutaba).
- Al pasar de solo lectura a edición, la sesión anterior se revoca en el servidor.
- Al salir de soporte, la identidad original se recupera aunque falle la red; el token de soporte vence en pocos minutos (riesgo residual documentado).

## 4. Sucursales — qué existe y qué no

| Concepto | En el sistema hoy |
|---|---|
| Sucursal registrada | **No existe** modelo ni tabla de sucursales en `schema.prisma`. |
| Sucursal activa / desactivada | No aplica sin modelo. |
| Sucursal conectada | No existe ningún dato de conexión por sucursal; el conteo inventado se retiró. |
| Sucursal operativa | No aplica. |

Consecuencias: no es posible implementar activación, desactivación ni eliminación lógica de sucursales con integridad (inventario, caja, ventas, asignaciones de usuario y documentos dependen de una sucursal que hoy no existe en la base). Requiere decisión de producto y migración revisada por NEXUS. Quedan sin cambio: `TransferenciasPage.tsx` (lista fija de sucursales, módulo oculto y pendiente), y el respaldo visual `'Sucursal Centro (Principal)'` de `TopBar.tsx` (fuera del alcance permitido de este agente; pendiente de coordinación con el frontend).

## 5. Usuarios

- Eliminación lógica: `DELETE /usuarios/:id` desactiva y no borra filas; idempotente si ya está inactivo.
- Reactivación: `PUT /usuarios/:id {activo: true}`.
- Operaciones de auditoría explícitas `USUARIO_DESACTIVAR` / `USUARIO_REACTIVAR`, con responsable (`usuarioId`), estado anterior y nuevo.
- Protecciones: último administrador activo (409, verificado en PostgreSQL bajo concurrencia); autodesactivación (409); empresa ajena (404).
- Desactivación: revoca todas las sesiones del usuario; el JWT revalida `activo` en cada petición.
- Usuarios con historial: no se borran; la trazabilidad de ventas, caja y auditoría se conserva.
- Sin migración: no se añadió campo `eliminado_en`. Si el dueño quiere distinguirlo de la desactivación, requiere migración aditiva revisada por NEXUS (no propuesta como ejecutada).

## 6. Matriz de permisos verificada (pruebas HTTP con guards y JWT reales)

| Operación (módulo usuarios) | ADMIN | CAJERO | VENDEDOR | BODEGUERO | SUPER_ADMIN (token de plataforma) |
|---|---|---|---|---|---|
| Listar / crear / editar / desactivar usuarios | Permitido | 403 | 403 | 403 | 403 |
| Ver usuarios de otra empresa | 401 (token falsificado) | — | — | — | 200 solo en su ruta de plataforma |
| Listar usuarios reales de una empresa (`/admin/tenants/:id/usuarios`) | — | — | — | — | Permitido (solo activos) |
| Iniciar soporte (`/admin/support/token`) | — | — | — | — | Permitido con motivo ≥10 caracteres |
| Escritura en sesión de soporte de solo lectura | — | — | — | — | 403 (`SOPORTE_ESCRITURA_DENEGADA` auditada) |
| Finalizar soporte (`/admin/support/finalizar`) | — | — | — | — | Solo sesión de soporte; token normal 403 |
| Trazabilidad (`/admin/soporte/trazas`) | — | — | — | — | Permitido; tenant ADMIN 403 |

Usuario desactivado o sesión revocada: 401 en cualquier ruta (pruebas HTTP y PostgreSQL).

## 7. Resultados de pruebas

Se detallan en la sección de bitácora de `docs/CONTEXTO_MAESTRO.md` con los números exactos de la última ejecución.

## 8. Migraciones

Ninguna. El PR no contiene archivos de migración ni cambios de `schema.prisma`.

## 9. Riesgos pendientes

1. Sucursales sin modelo (bloqueo de producto; ver §4).
2. Eliminación lógica distinta de la desactivación: pendiente de decisión y NEXUS.
3. Token de soporte: si la red falla al finalizar, la sesión se revoca al vencer (≤15 min).
4. `TopBar.tsx` muestra "Sucursal Centro (Principal)" cuando no hay sucursal; fuera del alcance de este agente.
5. `TransferenciasPage.tsx` mantiene sucursales fijas (módulo oculto).
6. Pruebas E2E de navegador de estas pantallas no ejecutadas en este PR (solo pruebas unitarias de frontend y HTTP/PostgreSQL de backend).
7. Despliegue y configuración de Render/Vercel no verificados; no se desplegó nada.
