# Módulos sin implementar: exposición y reactivación — 2026-10-29

Apartados, transferencias entre sucursales, pedidos especiales y listas de precio no tienen operaciones reales: no hay endpoints ni persistencia de negocio. Antes se mostraban en el menú de todo negocio nuevo (`DEFAULT_TENANT_MODULES`) y sus páginas guardaban datos de ejemplo en `localStorage`.

## Qué cambia

| Capa | Antes | Ahora |
| --- | --- | --- |
| Predeterminados para negocios nuevos | Incluidos | Excluidos (`DEFAULT_TENANT_MODULES`) |
| Negocios existentes con registro habilitado | Activos | **Ocultos**: `MODULOS_NO_IMPLEMENTADOS` anula cualquier registro. No se borra ningún registro |
| Super Admin | Podía encenderlos | Rechazado con «Módulos inválidos» (`updateTenantModules`) |
| Menú | Visibles | Ocultos (`PENDING_MODULES` y ya no aparecen en `ModuleControls`) |
| Rutas directas (`/apartados`, etc.) | Renderizaban un aviso | Sin ruta: caen en la redirección de `*` a `/` |
| Páginas con `localStorage` | Existían sin uso | **Eliminadas** |
| Endpoints | Ninguno | Ninguno (verificado: 0 rutas de controlador) |

Otros módulos no cambian: `pos`, `cotizaciones`, `inventario`, `clientes`, `garantias`, `reportes` y los demás siguen en `DEFAULT_TENANT_MODULES`.

## Pruebas de regresión

- `backend/src/common/tenant-modules.spec.ts`: no son predeterminados ni configurables; un registro antiguo `enabled: true` no los enciende; los negocios nuevos no reciben registro; otros módulos siguen activos.
- `backend/src/super-admin/super-admin.service.spec.ts`: Super Admin no puede encenderlos.
- `frontend/test/modulos-pendientes-guard.test.mjs`: sin rutas ni páginas; el POS no lee listas de precio; la lista del frontend coincide con `MODULOS_NO_IMPLEMENTADOS` del backend.

## Cómo reactivar uno (cuando exista implementación)

1. Implementar sus operaciones con persistencia en PostgreSQL, permisos, aislamiento por `tenantId` y pruebas de integración.
2. Quitarlo de `MODULOS_NO_IMPLEMENTADOS` (backend) y de `PENDING_MODULES` (frontend). La prueba de coincidencia falla si solo se cambia una de las dos listas.
3. Añadirlo a `DEFAULT_TENANT_MODULES` si debe estar activo por defecto, y añadir su ruta en `App.tsx` con `ProtectedRoute`.
4. No reutilizar las páginas eliminadas: guardaban estado solo en el navegador.

## Riesgos residuales

- Los registros antiguos de estos módulos siguen en la base de datos. No causan efecto, pero son datos inertes que habría que revisar antes de una reactivación.
- Ninguna operación real se pierde: no existía.
