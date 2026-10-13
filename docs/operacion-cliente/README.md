> **Candidato integrado:** usar la plantilla de seis columnas y el validador estricto único. ADMIN fija costo y precio en «Precios y aprobación»; la aprobación inicial completa el vigente sin movimientos ni CxP. Se admiten doce unidades. Procedimiento y estado de liberación: [CANDIDATO_CLIENTE_INTEGRADO.md](../CANDIDATO_CLIENTE_INTEGRADO.md). Los bloques históricos siguientes describen las bases anteriores.

# Preparación operativa del cliente · FerreSystem

Materiales para que la ferretería pueda empezar a operar en FerreSystem y registrar su inventario real. **Solo documentación, plantillas y una herramienta de control que lee archivos.** No cambia código, esquema, migraciones, configuración ni datos.

**Estado:** borrador para revisión · 2026-10-12 · base `origin/main` `7ccfad25`.

## Contenido

### Operación del sistema

| Archivo | Para quién | Qué trae |
|---|---|---|
| [01-inventario.md](01-inventario.md) | Administrador, bodega | Vías de carga, datos y campos, unidades, **codificación**, reglas del importador, **costos y precios** y el impedimento de costo vigente inicial |
| [02-manual-cajero.md](02-manual-cajero.md) | Cajeros | Venta, cobro, entrega y cierre, con restricciones reales |
| [03-manual-administrador.md](03-manual-administrador.md) | Administrador | Usuarios, productos, precios, existencias, ventas, entregas, cierres y **lista de decisiones del dueño** (§13) |
| [04-plan-capacitacion.md](04-plan-capacitacion.md) | — | **Superado** por 10 (versión de 60 minutos) |
| [05-lista-verificacion-primer-dia.md](05-lista-verificacion-primer-dia.md) | Dueño, soporte | Checklist de arranque con criterio Go / No-Go |

### Entrega e instalación (orden de uso)

| Archivo | Para quién | Uso |
|---|---|---|
| [12-datos-cliente.md](12-datos-cliente.md) | Dueño | Datos que pedir al cliente antes de instalar: inventario, usuarios, sucursal, métodos de pago y responsables |
| [09-equipos-y-accesos.md](09-equipos-y-accesos.md) | Administrador, soporte | Configuración de la computadora principal y del cajero, navegador, lector, impresora, internet y acceso |
| [11-captura-inventario-simple.md](11-captura-inventario-simple.md) | Administrador, bodega | Captura de inventario en seis columnas, categorías, unidades y precios |
| [08-primer-dia.md](08-primer-dia.md) | Todo el personal | Procedimiento del primer día: sesión, caja, venta, cobro, entrega y cierre |
| [10-capacitacion-30-min.md](10-capacitacion-30-min.md) | Administrador y cajero | Capacitación práctica de 30 minutos |


### Inventario real

| Archivo | Para qué | Cuándo |
|---|---|---|
| [06-control-previo-importacion.md](06-control-previo-importacion.md) | Control de calidad del archivo antes de importar: qué revisa el validador, qué revisar a mano, cómo pasar del maestro al importable | Antes de **cualquier** importación real |
| [07-levantamiento-conciliacion-jornada.md](07-levantamiento-conciliacion-jornada.md) | Procedimiento de conteo por producto, diseño para dos personas (y una), corte, conciliación de diferencias y plan de la primera jornada | Durante el levantamiento físico |

### Plantillas CSV (`plantillas/`)

| Archivo | Uso | Advertencia |
|---|---|---|
| `inventario_registro_maestro.csv` | **Hoja maestra**: familia, códigos, costos, precios, existencia contada, reconteo, diferencia y decisión del admin | No es el archivo que se importa. Sus columnas de conteo no las lee el importador |
| `inventario_importable_ferresystem.csv` | Encabezados exactos del importador | Llenar solo con datos reales y **existencia 0** (`06` §4) |
| `ejemplo_ficticio_capacitacion.csv` | Formato anterior de 8 columnas con precios | **No usar.** Usar `ejemplo_ficticio_v2.csv` |
| `ejemplo_ficticio_v2.csv` | 6 productos ficticios `[EJEMPLO]` de seis columnas para practicar | **Solo preproducción o copia de práctica.** El validador lo rechaza a propósito |
| `precios_para_aprobar_administrador.csv` | Hoja de trabajo para el administrador | **No se importa** |

### Herramienta (`herramientas/`)

| Archivo | Qué hace |
|---|---|
| `validar_plantilla.py` | Revisa un CSV importable y reporta errores (duplicados, vacíos, unidades no admitidas, coma decimal, filas de ejemplo, códigos existentes). Solo lee el archivo; sin dependencias externas. Ver `06` §1 |

```
python3 herramientas/validar_plantilla.py ARCHIVO.csv --catalogo CODIGOS_EXISTENTES.csv
```

## Qué se verificó y dónde

Comprobado en el código de `main` `7ccfad25`:

- Importador de productos: `frontend/src/components/ImportarProductosModal.tsx`.
- Alta de producto, código automático y costo vigente: `backend/src/productos/productos.service.ts`.
- Recepción de compra, único escritor de `costo_vigente`: `backend/src/operaciones/operaciones.service.ts` (línea 77).
- Conteo, conflictos, aplicación y reglas de reserva y unidad: `backend/src/levantamientos/levantamientos.service.ts` y `frontend/src/pages/LevantamientoPage.tsx`.
- Modelo y enumeraciones: `backend/prisma/schema.prisma`.
- Caja, venta y entregas: `backend/src/ventas/ventas.service.ts`, `backend/src/operaciones/ledger.ts`, `backend/src/operaciones/operaciones.controller.ts`.
- Pantalla de venta: `frontend/src/pages/POSPage.tsx`.
- Rutas y roles: `frontend/src/App.tsx`.

Lo que **no** se verificó y aparece marcado en los documentos:

- Comportamiento en navegador real con datos reales, incluidos los rótulos exactos de la pantalla de inventario.
- Lector de códigos y cámara en el equipo del cliente; iPhone real.
- Impresión de etiquetas: el sistema no las genera.
- Datáfono, transferencias y respaldo o restauración en producción.
- Procedimiento fiscal: queda fuera de estos materiales.

## Impedimento abierto

**Costo vigente inicial.** El sistema no tiene un mecanismo seguro para fijar `costoVigente` sin una recepción de compra, y esa recepción suma existencias y crea una cuenta por pagar. El costo de referencia sí se puede cargar. Detalle en `01-inventario.md` §8.3. **Pendiente de decisión del PM** (decisión I12). No se implementó código.

## Qué no contiene

- Ningún dato real de la ferretería. Lo ficticio está marcado como `[EJEMPLO]` o `EJ-*`.
- Ninguna pantalla, botón o función inventada. Donde el sistema no tiene algo, el documento lo dice.

## Pendientes que bloquean la operación real

1. Decisiones I1 a I12 y D1, D4, D5 en `03-manual-administrador.md` §13.
2. Validación en el equipo del cliente: navegador, lector, cámara e impresión.
3. Responsable de soporte y canal de incidentes (nombres y contactos los pone el cliente).
4. Respaldo y restauración verificados (`05`, sección F).
5. Capacitación realizada y evidencia de asistencia.

La aceptación del cliente y el merge son decisiones separadas de esta documentación.

## Ruta de uso

1. Leer `03-manual-administrador.md` y `01-inventario.md`. Tomar las decisiones I1 a I6.
2. Capacitar con `04-plan-capacitacion.md` en preproducción.
3. Preparar el maestro con `07` §3 y validar con `06`.
4. Cargar el catálogo en copia de práctica y después en la real, con autorización escrita.
5. Contar con `07` (día 0) y conciliar (día +1).
6. Completar `05` con evidencia y decidir Go / No-Go con el dueño.
