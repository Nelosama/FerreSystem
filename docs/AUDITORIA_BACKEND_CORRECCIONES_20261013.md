# Correcciones backend — auditoría adversarial del 12/10/2026

**Fecha:** 2026-10-13 · **Área:** backend (NestJS/Prisma/PostgreSQL) · **Fuente:** [auditoria_ferresystem.md](../auditoria_ferresystem.md)

**Rama de trabajo:** `claude/dazzling-bell-xxx0pn`. El encargo nombraba `fix/auditoria-backend`, pero las instrucciones del entorno designan `claude/dazzling-bell-xxx0pn` y prohíben crear ramas nuevas. Por eso se trabajó allí.

**Commits (sobre `4b650445`):**

| SHA | Contenido |
|---|---|
| `af13c754` | Importación masiva de productos (P0/P1 CSV) |
| `beb317b6` | Aritmética en centavos en ventas y cotizaciones; total cobrado y saldo (P1 crédito, P3) |
| `649ccb91` | Validación del color de marca `#RRGGBB` (P3) |

**Fuera de alcance de este informe:** no hay cambios en páginas React, CSS ni navegación; no hay migraciones ni cambios de esquema Prisma (por tanto no aplica informe de NEXUS); no hay merge ni despliegue.

---

## 1. Hallazgos corregidos

| Hallazgo (auditoría) | Estado | Corrección backend |
|---|---|---|
| **[P0]** Precios de venta y costo importados por CSV quedan en L.0.00 | Corregido en backend. **Pendiente en frontend** (ver §4) | Nueva ruta `POST /productos/importacion`: precios, aprobación explícita, estados y todo-o-nada |
| **[P1]** Precios negativos y códigos de barras duplicados pasan por el importador | Corregido | Validación por fila en `importacion-productos.ts`, en el servidor |
| **[P1]** Filas malformadas, duplicados dentro del archivo y contra la base | Corregido | Errores por fila y campo; el archivo completo se rechaza si hay un error |
| **[P1]** Categorías con mayúsculas, espacios y acentos crean duplicados | Corregido (solo importación CSV) | Categoría existente se reutiliza por clave normalizada; las nuevas se guardan limpias |
| **[P2]** Nombres de producto repetidos | Corregido en importación; alta manual **pendiente** | No bloquea (puede ser un producto distinto); devuelve advertencia con los productos parecidos |
| **[P1]** Crédito: total facturado, cobrado y saldo no se distinguen | Corregido | `totalFacturado`, `totalCobrado` y `saldoPendiente` en crear, leer y listar ventas |
| **[P1]** Crédito sin vencimiento | **Decisión pendiente del dueño** | No se inventó regla. Se conserva el comportamiento existente: plazo del cliente si existe, si no, el vencimiento enviado (puede ser nulo) |
| **[P2]** Venta sin existencias y entregas físicas | Verificado, sin cambio necesario | La entrega física descuenta con `UPDATE` condicional (`entregas-core.ts`). La venta sin inventario exige proveedor (pedido especial) |
| **[P2]** Descuentos negativos o sobre el límite | Verificado y mejorado | Negativo rechazado por `decimal()`. Límite comparado en centavos exactos (`ledger.ts` `validateDiscount`) |
| **[P3]** Línea 2.5 × L.25.99: línea L.64.98 y subtotal L.64.97 | Corregido | Aritmética en centavos enteros, mitad hacia arriba, en venta y cotización |
| **[P3]** Color de marca inválido se guarda y la vista previa cae a negro | Corregido en servidor | `PATCH` de configuración responde 400 si no es `#RRGGBB` |
| **[P3]** Venta a crédito con recibo "TOTAL PAGADO" | Dato disponible; texto del recibo **pendiente en frontend** | El backend ya expone cobrado y saldo para que el recibo los muestre |

**Verificado sin cambios (cubierto por suites existentes):** idempotencia de ventas y cobros, recepción parcial de compras, costo vigente con la última compra, devoluciones, cierre de caja, aislamiento multi-tenant y auditoría por usuario. Las suites de integración existentes pasan completas (ver §6).

**No corregido, fuera de alcance asignado:**

- **Soporte remoto (404):** el backend responde 404 con «Usuario o ferretería no disponible para soporte» porque el usuario no existe en el tenant (`super-admin.service.ts:186`). La causa está en el frontend, que muestra cuatro usuarios de demostración fijos. Corresponde a `fix/auditoria-admin`.
- **Eliminar usuarios y sucursales:** decisión de producto pendiente (desactivar frente a borrar).
- **Número de comprobante `V-3` en devoluciones:** la ruta usa el ID de la venta; la traducción del número visible es de pantalla (frontend).
- **Redondeo en otros módulos** (compras, devoluciones, abonos, dashboard, estado de cuenta): no se unificó en esta entrega. Ver §7.

---

## 2. Causas raíz

**P0 — precios en L.0.00 (causa confirmada en código):**
- El importador del frontend (`ImportarProductosModal.tsx`) solo lee código, nombre, categoría, existencias, mínimo y unidad. Su `payload` no incluye `precioVenta` ni `precioCosto`, así que el backend nunca recibe precios.
- El backend no tenía una importación masiva con precios. `POST /productos` fija precio solo para ADMIN, y el importador envía fila por fila sin esa información. Un alta sin precio queda `precioAprobado=false` con precio 0.
- Efecto: todo producto importado queda pendiente con L.0.00, incluidos los que traían precio en el archivo.

**P1 — validación CSV:** la validación vivía solo en el navegador. Cada fila se enviaba con `POST`/`PUT`, sin revisión conjunta del archivo ni de duplicados dentro del mismo archivo.

**P1 — crédito:** la venta guardaba `saldoCredito` y la cuenta CXC guardaba el saldo, pero la respuesta no separaba total cobrado y saldo. Los abonos sí actualizan ambos saldos (`operaciones.service.ts`).

**P3 — L.0.01:** `Math.round(precio * cantidad * 100) / 100` opera en coma flotante. Con `25.99 * 2.5 * 100 = 6497.4999…`, el redondeo da 64.97. Con la fórmula anterior, el total resultante era L.74.72. Con centavos enteros da L.64.98 y L.74.73.

**P3 — color:** `updateTenantBranding` guardaba `colorPrimario` sin validar formato.

---

## 3. Archivos modificados

**Nuevos:**
- `backend/src/productos/importacion-productos.ts`: validación pura (sin base de datos) de filas, precios, unidades y duplicados.
- `backend/src/productos/dto/importacion-productos.dto.ts`: DTO de entrada (`solicitudId`, `filas`, `sobrescribir`, `aprobarPrecios`, `motivo`).
- `backend/src/productos/importacion-productos.spec.ts`: 22 pruebas unitarias.
- `backend/test/importacion-productos.postgres.integration.ts`: 18 pruebas HTTP con PostgreSQL real.
- `backend/src/common/redondeo-monetario.ts`: conversión a centavos y división mitad hacia arriba para el backend en línea.
- `backend/src/common/redondeo-monetario.spec.ts`: 11 pruebas unitarias.
- `backend/test/redondeo-cobro.postgres.integration.ts`: 4 pruebas HTTP con migraciones reales (fracción, contado, crédito con abono, cotización).
- `backend/src/tenants/tenants-branding.spec.ts`: 6 pruebas de validación de color.

**Modificados:**
- `backend/src/productos/productos.service.ts`: método `importar`; `estadoPrecio` en la proyección.
- `backend/src/productos/productos.controller.ts`: ruta `POST /productos/importacion` con `@RespuestaSinProducto()`.
- `backend/src/productos/producto-response.ts`: incluye `estadoPrecio` en la respuesta pública.
- `backend/src/main.ts`: analizador JSON de 2 MB (ver §4 y §7).
- `backend/src/operaciones/ledger.ts`: `validateDiscount` en centavos exactos.
- `backend/src/ventas/ventas.service.ts`: cálculo con `calcularTotales`; `cobroDeVenta` (facturado, cobrado y saldo).
- `backend/src/cotizaciones/cotizaciones.service.ts`: líneas, descuento general e ISV en centavos.
- `backend/src/tenants/tenants.service.ts`: validación de `colorPrimario`.

**No modificados a propósito:** `backend/src/common/dinero.ts` (es espejo del módulo offline del frontend, que se prueba con vectores compartidos) y `frontend/**`.

---

## 4. Contratos API que debe consumir Claude (frontend)

**A. `POST /api/productos/importacion`** (permiso `inventario.editar`; roles ADMIN y BODEGUERO)

Solicitud:
```json
{
  "solicitudId": "uuid-v4-generado-al-abrir-la-importacion",
  "filas": [
    { "codigo": "CLV-1", "nombre": "Clavo 2 pulgadas", "codigoBarras": "7501234567890",
      "categoria": "Tornillería", "unidadMedida": "UNIDAD",
      "stockActual": "10", "stockMinimo": "2", "precioCosto": "50.00", "precioVenta": "85.00" }
  ],
  "sobrescribir": false,
  "aprobarPrecios": false,
  "motivo": "Importación de inventario revisada"
}
```

Reglas:
- Límite: 5000 filas. El cuerpo JSON admite hasta 2 MB.
- **Celda vacía** en precio, costo, existencias o mínimo = «no informado». En sobrescribir, un valor vacío **no cambia** el dato actual. En alta nueva, existencias y mínimo quedan en 0 y precio y costo en 0.
- `precioVenta` = 0 o negativo → error de fila. Un precio vendible debe ser mayor que cero.
- `precioCosto` = 0 explícito → costo cero legítimo, se guarda.
- Solo ADMIN puede enviar precios o `aprobarPrecios: true`. Si BODEGUERO los envía → 403.
- `aprobarPrecios: true` (solo ADMIN) aprueba los precios que trae el archivo. Sin esta marca, quedan `PENDIENTE_APROBACION`.
- `sobrescribir: false` (por defecto): los códigos existentes se omiten (`OMITIDO`). `true`: se actualizan.

Respuesta 201:
```json
{
  "resultado": "APLICADA", "creados": 1, "actualizados": 0, "sinCambios": 0, "omitidos": 0, "reintento": false,
  "filas": [ { "fila": 1, "codigo": "CLV-1", "accion": "CREADO", "productoId": "uuid", "estadoPrecio": "APROBADO" } ],
  "advertencias": [ { "fila": 1, "codigo": "CLV-1", "tipo": "NOMBRE_REPETIDO_EN_BASE",
                      "mensaje": "…", "coincidencias": [ { "productoId": "uuid", "codigo": "X", "nombre": "…", "activo": true } ] } ]
}
```
`accion`: `CREADO`, `ACTUALIZADO`, `SIN_CAMBIOS`, `OMITIDO`.

Errores (nada se guarda):
- **400** `code: "IMPORTACION_INVALIDA"`: `errores: [{ fila, codigo, campo, mensaje }]`. Mostrar cada error junto a su fila.
- **403**: precios enviados por no ADMIN.
- **409**: el mismo `solicitudId` se reutilizó con otros datos, o un producto cambió durante la importación (`code: "PRODUCTO_VERSION"`). Pedir volver a cargar el archivo.

Idempotencia: reenviar el mismo `solicitudId` con los mismos datos responde 201 con `reintento: true`, sin escribir de nuevo.

**B. Estado del precio en productos.** Todas las respuestas de producto incluyen `estadoPrecio`:
- `APROBADO`: se puede vender.
- `PENDIENTE_APROBACION`: tiene precio pero no está aprobado.
- `SIN_PRECIO`: precio 0.

Úsenlo para etiquetar y filtrar. `precioAprobado` y `pendienteConfiguracion` siguen existiendo.

**C. Ventas.** `POST /ventas`, `GET /ventas` y `GET /ventas/:id` incluyen:
- `totalFacturado`: igual a `total`.
- `totalCobrado`: al contado, igual al total; en crédito, facturado menos saldo.
- `saldoPendiente`: en crédito, el saldo de la venta; al contado, 0.

El recibo de crédito debe mostrar `saldoPendiente` y no «TOTAL PAGADO».

**D. Cotizaciones.** Sin cambio de contrato. Los importes salen en centavos exactos y coinciden con la venta a la que se convierten.

**E. Color de marca.** `PATCH` de configuración con `colorPrimario` distinto de `#RRGGBB` responde 400 `Color de marca inválido: use el formato #RRGGBB`.

---

## 5. Lo que el frontend debe hacer para cerrar P0

Hasta que Claude adapte `ImportarProductosModal.tsx`, la importación sigue sin precios. El cambio mínimo es:
1. Leer `precioVenta` y `precioCosto` del CSV, con vacío como «no informado».
2. Enviar todo el archivo en una sola llamada a `POST /productos/importacion`, con un `solicitudId` nuevo.
3. Mostrar `errores` por fila y `advertencias` antes de confirmar.
4. Para ADMIN, ofrecer una casilla «aprobar precios del archivo». Para BODEGUERO, ocultar precios y costos (ya no llegan en las respuestas).
5. Retirar el bucle fila por fila con `POST` y `PUT`.

---

## 6. Resultados de pruebas

**Entorno:** backend con dependencias instaladas desde `package-lock.json`; Node 22; PostgreSQL 16 en clúster desechable, creado por las propias pruebas (`PG_BIN`). `initdb` no admite root, así que se usó un envoltorio fuera del repositorio que lo ejecuta como `ubuntu`. No se tocó ninguna base real ni ninguna migración productiva.

| Comprobación | Antes | Después |
|---|---|---|
| Unitarias (`npx vitest run`) | 40 archivos / 377 pruebas, todas pasan | **43 / 416**, todas pasan |
| Integración (`vitest run --config vitest.config.integration.ts`) | 55 / 904 pasan, 1 omitida | **57 / 926 pasan**, 1 omitida (la misma de antes) |
| `npm run build` | — | Correcto |
| `npm run test:scripts` | — | 42 / 42 |
| `verificar-migraciones.mjs --base origin/main` | — | Correcto, sin migraciones nuevas |
| `oxlint` sobre los archivos tocados | — | Sin avisos (un aviso previo en `cotizaciones.service.spec.ts` no se tocó) |

**Pruebas nuevas y qué cubren:**
- Validación de importación (22 unitarias): precios ausentes, cero y negativos; formato; duplicados de código y barras; filas malformadas; advertencias de nombre; unidades.
- Importación HTTP (18 integración): alta con y sin aprobación; todo o nada; duplicados contra la base; reintento e idempotencia; dos envíos simultáneos con la misma solicitud; omitir y sobrescribir sin borrar datos; revocación de aprobación; movimiento AJUSTE; costo de producto con compra rechazado sin escritura parcial; reservas; categorías; advertencia de nombre; aislamiento entre empresas; auditoría; archivo de 1500 filas por encima del límite de Express y rechazo de 5001.
- Redondeo (11 unitarias): centavos, mitad hacia arriba, 2.5 × 25.99, límites de descuento en el borde.
- Venta y cotización (4 integración): fracción 2.5 × 25.99 → 64.98 / 9.75 / 74.73; contado; crédito con abono parcial (74.73 → 44.23) y sin vencimiento inventado; cotización con descuento general (63.23).
- Color (6 unitarias).

**Verificación del defecto original:** la fórmula anterior, evaluada en Node, da subtotal 64.97 y total 74.72, exactamente lo que reportó la auditoría.

**Limitaciones:**
- No se midió el tiempo de importación de 5000 filas en una transacción (la prueba usa 1500 filas).
- No hubo pruebas del frontend porque no se cambió.
- No se ejecutó nada contra producción ni contra datos del cliente.

---

## 7. Riesgos pendientes y decisiones

1. **Bloqueante para P0 extremo a extremo:** el importador del frontend no envía precios hasta que Claude adapte la pantalla (§5).
2. **Decisión de negocio (dueño):** que un ADMIN importe y apruebe precios con `aprobarPrecios` es una interpretación de la regla de aprobación. Confirmar antes de usarlo en el piloto.
3. **Costo bloqueado en productos con compra recibida:** la regla «el costo lo fija la última compra» se mantiene, así que la importación rechaza un costo distinto para esos productos. Puede afectar la carga inicial si ya hay compras.
4. **Vencimiento de crédito sin decisión:** no se obliga ni se fija plazo por defecto. Decisión pendiente del dueño.
5. **Redondeo en otros módulos:** compras, devoluciones, abonos, dashboard y estado de cuenta todavía usan `Math.round` con `float`. Diferencias de L.0.01 posibles en casos límite. Siguiente paso recomendado: aplicar `redondeo-monetario.ts` a esos módulos con pruebas por módulo.
6. **Productos ya importados con L.0.00:** siguen pendientes. Corregirlos requiere que un ADMIN los apruebe en «Precios y aprobación». No se modificó ningún dato real.
7. **Límite JSON global de 2 MB:** aplica a todas las rutas JSON, no solo a la importación. Es un tope, no un aumento de uso.
8. **Alta manual con nombre repetido:** el backend no advierte. El frontend puede consultar `GET /productos?search=` antes de guardar.
9. **Transacción de importación grande:** tiempo de espera de 120 s y espera máxima de 10 s. Medir con archivos reales antes del piloto.

---

## 8. Recomendación del área backend

**GO condicionado para revisión y piloto controlado. NO-GO para producción** hasta cumplir:

1. Claude adapta el importador al contrato `POST /productos/importacion` (§5).
2. El dueño confirma la semántica de `aprobarPrecios` y la decisión de vencimiento de crédito.
3. Prueba de importación con un archivo real de tamaño esperado en un entorno de preproducción, con medición de tiempo.

El backend no tiene migraciones pendientes ni cambios de esquema, y las suites completas pasan. Esto no sustituye la aceptación del cliente ni el merge o despliegue, que no se han hecho.
