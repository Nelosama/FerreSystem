# Informe QA — FerreSystem
**Iteración 1 · 7 de octubre de 2026**

| Campo | Detalle |
|---|---|
| URL probada | https://ferre-system.vercel.app/ |
| Backend | Render — NestJS + Prisma + Supabase PostgreSQL |
| Empresa probada | Ferreteria Alex (tenant de prueba) |
| Rol probado | ADMIN |
| Pantallas revisadas | 20 |
| Bugs encontrados | 4 (1 Crítico · 1 Alto · 1 Medio · 1 Bajo) |
| **Calificación** | **3 / 10** (operación central bloqueada) |

---

## Causa raíz — Logs de Render

El backend arrancó correctamente (`9 migrations found, none pending`), pero el código compilado en `dist/` referencia columnas y tablas que **no existen en la base de datos de Supabase**. Esto indica que una o más migraciones fueron generadas localmente y nunca ejecutadas en producción.

> **Fix inmediato:** ejecutar `npx prisma migrate deploy` en el entorno de producción.

### Objetos faltantes confirmados por los logs

| Error Prisma | Objeto faltante | Módulos afectados |
|---|---|---|
| `P2022` | `productos.stock_reservado` | Inventario, POS, Cotizaciones, Alertas stock |
| `P2022` | `ventas.reserva_pendiente` | Dashboard, Reportes, Ventas |
| `P2022` | `clientes.codigo` | Clientes (GET y POST) |
| `P2022` | `levantamientos.aplicado_at` | Levantamientos (GET y POST) |
| `P2010` | tabla `proveedores` | Compras, Proveedores |
| `P2010` | tabla `cajas` | Caja (apertura y cierre) |
| `P2010` | tabla `ordenes_compra` | Compras (listado) |
| `P2010` | tabla `cuentas_operativas` | Cuentas por cobrar/pagar |
| `P2010` | tabla `solicitudes_devolucion` | Devoluciones |
| `P2010` | tabla `devoluciones` | Operaciones / Resumen |
| `P2010` | tabla `auditoria_operaciones` | Auditoría |
| `P2010` | columna `v.cliente_nombre` (JOIN) | Entregas |

> **Nota:** el módulo de autenticación **no está afectado**. El log confirma login exitoso con bcrypt y JWT generado correctamente.

---

## Bugs

### Bug #1 — Crítico · Inventario / POS / Clientes / Caja / Compras y demás módulos operativos

**Descripción:** La totalidad de los módulos operativos devuelve HTTP 500. No es posible consultar datos, crear productos, registrar clientes, abrir caja ni procesar ventas.

**Pasos para reproducir:**
1. Iniciar sesión como ADMIN (Ferreteria Alex).
2. Abrir Inventario e intentar crear un producto (descripción, precio 10, costo 5, stock 0, mínimo 1).
3. Guardar.
4. Abrir POS, Clientes y Caja.

**Resultado esperado:** El producto se guarda y queda disponible en el catálogo. POS carga productos y clientes para procesar ventas.

**Resultado actual:** Todos los módulos devuelven `Internal server error`. La consola del navegador confirma HTTP 500 en cada petición.

**Causa raíz (logs):** El `dist/` compilado referencia las 12 columnas/tablas listadas en la sección anterior, ninguna de las cuales existe en Supabase.

**Corrección:**
```bash
npx prisma migrate deploy
```
Si la migración aún no existe localmente, generarla primero:
```bash
npx prisma migrate dev --name add_stock_reservado_and_modules
```

---

### Bug #2 — Alto · Cotizaciones / Comisiones

**Descripción:** Cuando la carga de datos falla por HTTP 500, el módulo muestra todos los indicadores en cero y el mensaje «No se encontraron cotizaciones registradas», sin ninguna alerta de error. El usuario no puede distinguir entre «no hay datos» y «no se pudieron cargar».

**Pasos para reproducir:**
1. Con el servidor en estado de error (Bug #1 activo), abrir Cotizaciones.
2. Observar los 4 indicadores numéricos y el listado.
3. Abrir Comisiones y cambiar el período a 1–7 oct 2026.
4. Revisar la consola: HTTP 500 en cotizaciones/productos y en datos de comisiones.

**Resultado esperado:** Aviso explícito de error de carga, indicadores en estado `—` y botón de reintento.

**Resultado actual:** Cotizaciones muestra cuatro ceros y «No se encontraron cotizaciones». Comisiones queda vacía sin aviso alguno.

**Causa raíz:** El frontend no diferencia la respuesta vacía `[]` de un error HTTP 500; renderiza ambos estados como "sin datos".

**Corrección:** Capturar el status HTTP en el cliente. Si es 4xx/5xx, mostrar un componente de error con opción de reintento en lugar del estado vacío.

---

### Bug #3 — Bajo · Clientes — i18n

**Descripción:** El botón de alta de clientes muestra la clave de traducción cruda.

**Pasos para reproducir:**
1. Seleccionar idioma Español.
2. Navegar a Clientes.
3. Leer el botón de creación.

**Resultado esperado:** `Nuevo cliente`

**Resultado actual:** `clients.new_client`

**Corrección:** Agregar la clave al archivo de traducciones ES:
```json
"clients": {
  "new_client": "Nuevo cliente"
}
```
Y su equivalente en EN: `"new_client": "New client"`.

---

### Bug #4 — Medio · Formularios modales — Accesibilidad

**Descripción:** Los botones de cierre (×) de varios modales no tienen nombre accesible. Usuarios de lectores de pantalla solo escuchan «botón» sin contexto.

**Pasos para reproducir:**
1. Abrir cualquiera de estos modales: Nuevo producto, Nuevo cliente, Nueva cotización, Editar usuario.
2. Inspeccionar el árbol de accesibilidad (DevTools → Accessibility) o navegar con lector de pantalla.
3. Localizar el botón junto al título del formulario.

**Resultado esperado:** El botón expone un nombre accesible como «Cerrar».

**Resultado actual:** El árbol muestra únicamente `button` sin nombre. El botón Cancelar sí tiene texto y actúa como alternativa.

**Corrección:**
```html
<!-- Opción A -->
<button aria-label="Cerrar">×</button>

<!-- Opción B -->
<button>
  <span aria-hidden="true">×</span>
  <span class="sr-only">Cerrar</span>
</button>
```

---

## Cobertura de pruebas

| Pantalla / flujo | Prueba realizada | Resultado |
|---|---|---|
| Autenticación | Cierre sesión, credenciales falsas, acceso directo sin sesión | ✅ Correcto |
| Login / roles | Sesión ADMIN; inspección de roles | ⏳ Otros roles: pendiente |
| Inicio (Dashboard) | Reintentar, aviso funciones pendientes | ❌ Error — Bug #1 |
| Navegación | 5 menús, buscador global | ✅ Correcto |
| Inventario | Alta vacía, precios negativos, stock negativo, alta válida | ❌ Alta válida — Bug #1 |
| Importación | Abrir importador | ✅ Abre (sin cargar archivo) |
| Clientes | Nombre vacío, correo inválido, alta válida | ❌ Alta válida — Bug #1 |
| POS | Catálogo, carrito vacío, descuento >100, pago tarjeta | ❌ Catálogo — Bug #1 |
| Cotizaciones | Alta vacía, borrador sin productos, selector | ❌ Carga — Bug #2 |
| Caja | Apertura vacía, fondo 0, confirmar pendiente | ❌ Error — Bug #1 |
| Compras | Proveedor vacío, factura sin productos, alta válida | ❌ Alta válida — Bug #1 |
| Levantamiento | Nombre vacío, creación válida | ❌ Creación — Bug #1 |
| Cuentas | Por cobrar y por pagar | ❌ Error — Bug #1 |
| Devoluciones | Búsqueda vacía, comprobante -1 | ❌ Historial — Bug #1 |
| Entregas | Abrir listado | ❌ Error — Bug #1 |
| Usuarios | Listado, editar, nuevo vacío, cancelar | ✅ Carga y valida |
| Comisiones | Período inicial y cambio de fechas | ❌ Error — Bug #2 |
| Reportes | Carga, rango invertido | ❌ Error — Bug #1 |
| Auditoría | Abrir historial | ❌ Error — Bug #1 |
| Configuración | Nombre vacío, color, guardar, recargar, restaurar | ✅ Correcto |
| Idioma | Cambio EN ↔ ES | ✅ Correcto |
| Notificaciones | Abrir y cerrar panel | ✅ Abre/cierra |
| Responsive (390×844) | Inicio, Más opciones, POS | ✅ Sin desbordamiento |

---

## Flujos bloqueados o sin verificar

Los siguientes flujos deben repetirse una vez resuelto el **Bug #1**:

- Crear / editar / eliminar: productos, clientes, proveedores, levantamientos.
- Flujo completo de venta (POS → factura).
- Conversión de cotización a venta.
- Recepción de compras y ajustes de stock.
- Cuentas por cobrar/pagar y abonos.
- Exportaciones de reportes.
- Apertura y cierre de caja (**la apertura quedó en estado pendiente — verificar en el servidor antes de reintentar**).
- Roles CAJERO / BODEGUERO y sus permisos.
- Aislamiento de datos entre tenants (multi-tenant).
- Logo, estilos de interfaz y selector de idioma en contexto de venta.

---

## Sugerencias UX

| # | Área | Sugerencia |
|---|---|---|
| 1 | Mensajes de error | Reemplazar `Internal server error` por mensajes en español que indiquen qué operación falló y qué puede hacer el usuario. |
| 2 | Estado vacío vs. error | Las tablas deben mostrar un componente de error distinto cuando la petición falla, no el estado «sin registros». |
| 3 | Rango de fechas | Validar `Desde ≤ Hasta` antes de enviar la petición y mostrar mensaje si el rango es inválido. |
| 4 | Descuento ADMIN | Usuarios muestra 0% para ADMIN pero POS indica «Límite cajero: 100%». Aclarar si es excepción deliberada o bug. |
| 5 | Período inicial en Comisiones | El módulo abre con marzo 2026. Usar el mes en curso como valor predeterminado. |
| 6 | Formatos de importación | El selector acepta CSV y XLSX pero las instrucciones solo mencionan CSV UTF-8. Unificar. |
| 7 | Menú móvil | Las etiquetas de la barra inferior se truncan. Usar abreviaturas claras o reorganizar en «Más». |
| 8 | Respaldos automáticos | La pantalla de Inicio informa que no hay respaldos configurados. Configurarlos antes de abrir a clientes reales. |

---

## Resumen y próximos pasos

| Severidad | Cantidad | Módulos principales |
|---|---|---|
| 🔴 Crítico | 1 | Inventario, POS, Clientes, Caja, Compras, Reportes, Auditoría |
| 🟠 Alto | 1 | Cotizaciones, Comisiones |
| 🟡 Medio | 1 | Todos los modales (accesibilidad) |
| 🟢 Bajo | 1 | Clientes (i18n) |

### Orden de resolución recomendado

1. **Inmediato — Bug #1:** `npx prisma migrate deploy` en producción.
2. **Post-migración:** Repetir pruebas de creación, flujo de venta y apertura/cierre de caja.
3. **Frontend — Bug #2:** Diferenciar error HTTP de lista vacía en cotizaciones y comisiones.
4. **Frontend — Bug #3:** Agregar clave `clients.new_client` a las traducciones.
5. **Accesibilidad — Bug #4:** Agregar `aria-label="Cerrar"` a los botones de cierre de modales.
6. **Iteración 2:** Una vez sin errores críticos, probar roles, aislamiento multi-tenant y flujos de devolución/cotización.

---

*FerreSystem — QA Iteración 1 — 7 oct 2026*
