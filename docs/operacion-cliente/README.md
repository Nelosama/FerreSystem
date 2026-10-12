# Preparación operativa del cliente · FerreSystem

Materiales para que la ferretería pueda empezar a operar en FerreSystem mientras la preproducción técnica se termina. **Solo documentación y plantillas.** No cambia código, esquema, migraciones, configuración ni datos.

**Estado:** borrador para revisión · 2026-10-12 · base `origin/main` `7ccfad25`.

## Contenido

| Archivo | Para quién | Qué trae |
|---|---|---|
| [01-inventario.md](01-inventario.md) | Administrador, bodega | Cómo entra el inventario, campos, unidades, reglas del importador, carga inicial |
| [02-manual-cajero.md](02-manual-cajero.md) | Cajeros | Procedimiento de venta, cobro, entrega y cierre, con restricciones reales |
| [03-manual-administrador.md](03-manual-administrador.md) | Administrador | Usuarios, productos, precios, existencias, ventas, entregas, cierres y decisiones pendientes |
| [04-plan-capacitacion.md](04-plan-capacitacion.md) | Instructor | Agenda de 60 minutos y ejercicios con datos ficticios |
| [05-lista-verificacion-primer-dia.md](05-lista-verificacion-primer-dia.md) | Dueño, soporte | Checklist de arranque con criterio Go / No-Go |

### Plantillas CSV (`plantillas/`)

| Archivo | Uso | Advertencia |
|---|---|---|
| `inventario_registro_maestro.csv` | Captura completa del inventario, incluidos proveedor, marca y código de barras | Solo para registrar. El importador **no** lee todas sus columnas |
| `inventario_importable_ferresystem.csv` | Encabezados exactos que acepta el importador | Llénelo con datos reales del cliente, sin filas de ejemplo |
| `ejemplo_ficticio_capacitacion.csv` | 8 productos ficticios `[EJEMPLO]` para la capacitación | **Solo preproducción o copia de práctica.** Nunca en la base real |

## Qué se verificó y dónde

Comprobado en el código de `main` `7ccfad25`:

- Importador de productos: `frontend/src/components/ImportarProductosModal.tsx`.
- Alta de producto y costo vigente: `backend/src/productos/productos.service.ts`.
- Modelo y enumeraciones (unidades, métodos de pago, roles): `backend/prisma/schema.prisma`.
- Apertura de caja obligatoria para vender: `backend/src/ventas/ventas.service.ts` (`openCash`) y `backend/src/operaciones/ledger.ts`.
- Pantalla de venta, métodos y botón de cobro: `frontend/src/pages/POSPage.tsx`.
- Caja, cierre y textos: `frontend/src/pages/ArqueoCajaPage.tsx`, `frontend/src/locales/es.json` (clave `cash_drawer`).
- Rutas y roles por pantalla: `frontend/src/App.tsx`.
- Endpoints de operaciones, entregas y devoluciones: `backend/src/operaciones/operaciones.controller.ts`.

Lo que **no** se verificó en esta revisión, y aparece marcado en los manuales:

- Comportamiento en navegador real con datos reales, incluida la pantalla de inventario con sus rótulos exactos.
- Cámara y lectura de códigos en iPhone real.
- Datáfono, cuentas bancarias y confirmación de pagos con tarjeta o transferencia.
- Respaldo y restauración en producción.
- Roles de la pantalla de órdenes de compra.
- Procedimiento fiscal: queda fuera de estos materiales.

## Qué no contiene

- Ningún dato real de la ferretería: productos, precios, existencias, clientes, proveedores o usuarios. Todo lo ficticio está marcado como `[EJEMPLO]` o `EJ-*`.
- Ninguna pantalla, botón o función inventada. Donde el sistema no tiene algo, el manual lo dice (vuelto, sucursal, ticket térmico, listado general de ventas para cajero, etc.).
- Ninguna promesa sobre importación masiva más allá de lo verificado: el importador acepta CSV UTF-8, hasta 5 MB y 5000 filas, con los encabezados y las 5 unidades descritas en `01-inventario.md`.

## Pendientes que bloquean la operación real

1. Decisiones del dueño listadas en `03-manual-administrador.md` §13 (costo manual, sobrescribir en importación, reembolsos, sucursal, aprobación de cambio en reportes, procedimiento fiscal).
2. Validación en el equipo del cliente: navegador, lector, cámara e impresión.
3. Responsable de soporte y canal de incidentes (nombres y contactos los pone el cliente).
4. Respaldo y restauración verificados (ver `05-lista-verificacion-primer-dia.md`, sección F).
5. Capacitación realizada y evidencia de asistencia.

La aceptación del cliente y el merge son decisiones separadas de esta documentación.

## Ruta de uso

1. Leer `03-manual-administrador.md` y `01-inventario.md`.
2. Capacitar con `04-plan-capacitacion.md` en preproducción.
3. Cargar el inventario real con las plantillas, primero en copia de práctica.
4. Completar `05-lista-verificacion-primer-dia.md` con evidencia.
5. Decidir Go / No-Go con el dueño.
