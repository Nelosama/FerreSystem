# QA del ciclo operativo de ventas

Base: `origin/main` `df3ae06b`. Confirmados como fusionados #108, #110, #111,
#113 y #115; también #112 y #114. Rama nueva: `qa/ciclo-ventas-operativo`.

## Defecto corregido

**QA-VENTA-001 / P1 — conversión de cotización registra efectivo sin permitir elegir
el método.** `CotizacionesPage` enviaba POST sin `metodoPago`; el servicio lo
interpretaba como EFECTIVO. Una transferencia, tarjeta o venta a crédito desde
esa pantalla no podía registrarse correctamente y podía aumentar indebidamente
el efectivo esperado o evitar la cuenta por cobrar.

La regresión con Chromium, login real, NestJS y PostgreSQL falla antes de la
corrección: el modal no ofrece selector de método. La UI ahora permite elegir los
cuatro métodos existentes y envía el elegido al backend. Crédito exige un cliente
registrado en la UI; las validaciones de habilitación y límite permanecen en backend.
Se conserva el bloqueo de doble confirmación y se reinicia el selector al abrir
otra cotización. Se usan los métodos que el backend ya admite, sin cambiar las reglas de caja.

**QA-VENTA-002 / P1 — vigencia mostrada un día antes.** El servicio trataba el DATE
devuelto por PostgreSQL a medianoche UTC como un instante del negocio. Una cotización
válida hasta hoy aparecía vencida. Una regresión HTTP/Prisma real falla con esa
clasificación antes del cambio. Se lee el día del DATE sin desplazarlo y se compara
con el día actual de Tegucigalpa. Las pruebas unitarias ahora representan el DATE
como realmente lo devuelve PostgreSQL.
La fecha de validez en la tabla de cotizaciones también se formatea sin desplazar
el DATE: otro caso de Chromium con zona America/Tegucigalpa fallaba antes del
cambio de la página, que mostraba el día anterior.

**Regla de vencimiento confirmada por el propietario durante esta QA:** exigir
renovar la vigencia antes de convertir. La conversión verifica la fecha dentro
de la transacción y rechaza documentos vencidos sin confirmar venta, reservas
ni cobros. Una regresión HTTP fallaba antes (201 en vez de 400); después se bloquea,
se renueva la fecha mediante PUT y se convierte correctamente. La vigencia de hoy
es inclusiva. No se cambian reglas de precios, descuentos, ISV ni caja.

También se corrigen dos avisos del modal: no se afirma que todo documento incluya
15% de ISV, y se explica que facturar reserva stock; la entrega descuenta el stock
físico. Se preservan los importes almacenados y las traducciones ES/EN.

## Escenarios y evidencia

| Escenario | Evidencia ejecutable | Resultado |
| --- | --- | --- |
| Alta con costo, precio y existencias; catálogo de POS | Nuevo ciclo HTTP y navegador real | Producto persistido y visible en POS |
| Producto inactivo, ajeno a otro tenant o stock insuficiente | Nuevo ciclo HTTP y suites de productos/ventas | Rechazado sin venta, cobro ni reserva |
| Cotización de varios productos; descuentos e ISV | Ciclo HTTP de 3 métodos | Bruto 250, descuento 30, ISV 33, total 253 |
| Cotización gravada/exenta | Nuevo ciclo HTTP | ISV 25.83, total 245.83, conservados en venta |
| Conversión simultánea y repetida | Ciclo HTTP y suite de cotizaciones | Una venta y un cobro; otra conversión rechazada |
| Efectivo, transferencia y tarjeta | HTTP y Chromium real | Método persistido; solo efectivo cambia efectivo esperado |
| Crédito de cliente registrado y abono parcial | Nuevo ciclo HTTP y suite de crédito | Factura 230, abono 30, saldo 200; un solo pago |
| Pago concurrente/repetido; clave reutilizada con otro importe | Nuevo ciclo HTTP | Mismo pago, sin duplicación; otro importe responde 409 |
| Última unidad, ventas concurrentes | Nuevo ciclo HTTP | Una venta válida; otra rechazada; reserva 1 |
| Entrega concurrente/repetida y trazabilidad | Ciclo HTTP | Stock físico 10→8 una vez; dos movimientos para dos productos |
| Fallo tras reservar y antes de confirmar caja | Trigger PostgreSQL temporal + HTTP | Rollback real; stock y caja intactos; reintento único |
| Venta sin inventario/bajo pedido | Nuevo ciclo HTTP y suite de ventas | Requiere proveedor; no descuenta stock ni crea entrega física |
| Venta por cajero y acceso al arqueo ajeno | Nuevo ciclo HTTP | Cajas separadas; cajero ajeno recibe 404 sin datos |
| Cierre con diferencia y reintento | Ciclo HTTP y suite de caja | Exige motivo; diferencia −1; una auditoría de cierre |
| Respuesta de POS perdida tras commit | Chromium + backend real | Consulta la solicitud y recupera comprobante, sin segundo POST |
| Cotización vencida y renovada | Regresión HTTP | Rechazo 400 sin efectos; tras renovar se convierte |
| Cotización válida hasta hoy | Regresión HTTP/DATE real | Por vencer hoy, no vencida; conversión permitida |

El bloqueo de vencimiento se implementó únicamente después de recibir la
indicación expresa del propietario de exigir renovación.

## Cómo repetir

Desde `backend`, con PostgreSQL instalado y frontend instalado:

```sh
PG_BIN=/ruta/al/binario/postgresql \
REAL_SETTINGS_BROWSER=1 \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/ruta/a/chromium \
npm run test:integration -- ciclo-ventas.postgres.integration.ts
```

En CI se usa el Chromium instalado por Playwright y puede omitirse su ruta.
`REAL_SETTINGS_BROWSER=1` ya está habilitado en el workflow de integración del
repositorio. Sin esa variable, el caso de Chromium queda omitido explícitamente;
los otros casos HTTP siguen ejecutándose.

Los fixtures crean su propio clúster PostgreSQL y aplican migraciones allí; nunca
usan una DATABASE_URL externa. Usuarios y productos son sintéticos y exclusivos
del clúster temporal. Los controllers, JWT, validación, servicios y operaciones
PostgreSQL son reales. El proveedor de configuración solo aporta parámetros locales
de la prueba. La pérdida de respuesta intercepta una petición que ya hizo commit
en el backend real; no simula una venta ni una respuesta exitosa.

## Validación y límites

Integración completa con la regla de vencimiento: 272/272 en 14 archivos.
El nuevo archivo contiene 13 casos con REAL_SETTINGS_BROWSER=1. Unitarias backend: 329/329; scripts: 13/13;
unitarias frontend: 178/178. Builds backend/frontend y lint sin errores; avisos
existentes de configuración TypeScript, hooks y tamaño de bundle.

La suite frontend de Playwright pasó 100/100; usa APIs simuladas y se informa separadamente;
no sustituye la nueva evidencia de navegador con PostgreSQL.

No se accedió a producción, no se hizo merge ni se ejecutó despliegue. No se
modifican CONTEXTO_MAESTRO.md, fechasNegocio.ts, las seis páginas excluidas ni ramas
de Claude. No se afirma preparación integral para producción: quedan pendientes
la revisión del propietario y CI del PR. La rama está publicada; la creación del PR
mediante `gh pr create` recibió `Post https://api.github.com/graphql: Forbidden`.
El acceso a la API de GitHub debe restablecerse para crearlo y verificar sus checks.
