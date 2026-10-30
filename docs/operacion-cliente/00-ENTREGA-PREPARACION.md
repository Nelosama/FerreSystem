# 00 · Entrega de preparación operativa (PR #156)

**Fecha:** 2026-10-13 UTC. **Estado:** material listo para la tienda; **no** listo para operar hasta que Codex entregue el despliegue y el dueño tome las decisiones de §3.

**Alcance:** documentación, plantillas y una herramienta de solo lectura. No hay cambios en backend, frontend, migraciones ni infraestructura. No se ejecutó nada en producción.

---

## 1. Materiales listos para el cliente

| Documento | Para quién | Uso |
|---|---|---|
| `08-primer-dia.md` | Todos | Procedimiento paso a paso: iniciar sesión, registrar, consultar, abrir caja, vender, cobrar, entregar, cerrar. Con permisos reales. |
| `09-equipos-y-accesos.md` | Dueño y administrador | Equipos, navegador, lector, impresora, internet, accesos, lista de verificación en tienda. |
| `10-capacitacion-30-min.md` | Todo el personal | Agenda de 30 minutos con operaciones reales, tarjeta de 5 pasos y criterio de aprobación. |
| `11-captura-inventario-simple.md` | Administrador y bodega | Captura de inventario en seis columnas, 7 categorías existentes, unidades admitidas, carga y precios. |
| `plantillas/inventario_importable_ferresystem.csv` | Administrador | Plantilla canónica de seis columnas. Vacía. |
| `plantillas/ejemplo_ficticio_v2.csv` | Capacitación | Productos ficticios para practicar. El validador los bloquea para importar. |
| `plantillas/precios_para_aprobar_administrador.csv` | Administrador | Hoja de precios. **No se importa.** |
| `herramientas/validar_plantilla.py` | Administrador | Entrada del validador estricto del candidato #158 (`backend/scripts/validar-inventario.py`). Requiere #158 en el repositorio. |
| `12-datos-cliente.md` | Dueño | Datos que hay que pedir al cliente antes de instalar. |

Documentos anteriores (`01`–`07`) se conservan como referencia técnica. **No usar `ejemplo_ficticio_capacitacion.csv` (8 columnas con precios) para importar:** el formato vigente es el de seis columnas.

---

## 2. Hallazgos del código que cambian el procedimiento

Verificados en el candidato `85e4ff88` (PR #155, base PR #153), no en el enunciado anterior:

1. **El importador sí lee precios** (plantilla de nueve columnas). Con precio y la casilla «aprobar precios» del administrador, el producto se vende al cargar. Sin precio, la celda queda vacía, el producto entra con existencia y queda **pendiente de aprobación**: **no se puede vender** hasta que el administrador lo fije.
2. **Precios iniciales:** ADMIN usa la pantalla existente «Precios y aprobación», producto por producto, con la hoja de revisión. «Aprobar para venta» registra también el costo inicial ausente/cero en la misma transacción, con ambas auditorías y sin mover stock ni CxP. Costo y venta deben ser positivos para esa aprobación inicial; preparar los productos que se venderán antes de abrir caja. No se importa la hoja de precios ni se habilita aprobación masiva.
3. **Unidades de importación del candidato integrado:** las 12 unidades del inventario. `galón` y `galon` se normalizan a `GALON`; no se convierten cantidades. Ver §2 de `11-captura-inventario-simple.md`.
4. **Las categorías se crean con cualquier texto.** Un error de tecleo crea una categoría nueva. Por eso la plantilla exige los 7 nombres existentes.
5. **Entrega:** solo ADMIN y BODEGUERO registran entrega física. El cajero debe usar «Cobrar y dejar en bodega (entrega después)». Esta regla está en el backend, no solo en pantalla.
6. **Caja:** toda venta o pago exige caja abierta del propio usuario.
7. **Costos:** solo ADMIN los ve. El cajero y el bodeguero no ven costos ni márgenes.
8. **Creación de productos:** ADMIN y BODEGUERO. El cajero no puede crear productos.
9. **Primer administrador:** lo crea el superadministrador con `POST /super-admin/tenants` y `POST /super-admin/tenants/:tenantId/admins`. No usar el seed.
10. **Sin internet no se vende:** la contingencia offline está apagada por defecto (403 sin `POS_OFFLINE_ENABLED`).

---

## 3. Decisiones que el dueño debe confirmar

Solo decisiones comerciales u operativas. Los números corresponden a `03-manual-administrador.md` §13.

| # | Decisión | Por qué bloquea el día 1 | Propuesta de trabajo |
|---|---|---|---|
| D-A | **Precio de venta de cada producto y quién lo aprueba** (I6) | Sin precio aprobado no se vende. | Dueño entrega la lista; administrador la carga antes del día de apertura. |
| D-B | **Costo de referencia** y qué hacer con artículos sin costo (I5) | Define qué filas entran al archivo de carga. | Dueño confirma la fuente (factura o lista del proveedor). |
| D-C | **Costo vigente inicial vacío** hasta la primera compra recibida (I12) | El inventario valorado arranca sin costo. Es decisión del PM. | Aceptar y documentar, o autorizar una función específica (no existe hoy). |
| D-D | **Unidad de venta por familia** (I4) | La unidad no se cambia después si hay movimientos. | Confirmar la tabla de §4 de `11-captura-inventario-simple.md`. |
| D-E | **Familias y categorías** (I1, I3) | Filtros y conteo. | Usar las 7 categorías existentes; confirmar que bastan. |
| D-F | **Formato de código** (I2) | Búsqueda, escáner y colisiones. | Confirmar formato o aceptar códigos del fabricante. |
| D-G | **Entrega en mostrador del cajero** | El cajero no puede entregar; hay que decidir quién entrega. | Confirmar que bodega o administración entregan (flujo de §7.B de `08`). |
| D-H | **Devoluciones**: quién solicita y quién autoriza | Solo ADMIN decide y ejecuta. | Confirmar que el cajero solo solicita. |
| D-I | **Pagos con tarjeta y transferencia**: referencia obligatoria y verificación | El sistema exige referencia pero no consulta al banco. | Confirmar el procedimiento del datáfono y de la cuenta bancaria. |
| D-J | **Hora de corte del inventario y ventas durante el conteo** (I8) | Exactitud del inventario aplicado. | Definir hora y regla. |
| D-K | **Umbral de diferencia y reconteo** (I7, I9) | Define cuándo el dueño revisa antes de aplicar. | Proponer 20 % de reconteo y todos los de mayor valor. |
| D-L | **Quién aplica el levantamiento** (I11) | Solo ADMIN puede aplicar. | Confirmar responsable de conflictos. |
| D-M | **Quién usa VENDEDOR** | Rol disponible, con permisos de venta y caja. | Asignar solo si hace falta, o dejar sin usuarios. |
| D-N | **Permiso `caja.movimientos_manuales`** (entradas y salidas de efectivo) | Sin permiso, el cajero no registra movimientos manuales. | Decidir a qué persona se asigna. |
| D-O | **Responsable de soporte y canal de incidentes** | Pendiente en `05` y `06`. | Nombre, teléfono y horario. |
| D-P | **Hora de apertura y cómo se entra el primer día** (sistema anterior o desde cero) | Afecta el inventario inicial. | Confirmar. |

**Costos, precios y cantidades** no están en este documento. El dueño debe entregarlos; no se completaron con ejemplos reales.

---

## 4. Equipos o accesos que debe preparar el dueño

Ver detalle en `09-equipos-y-accesos.md` §5. Resumen:

- [ ] Dirección HTTPS de la aplicación (**depende de Codex**).
- [ ] Correo del administrador principal y de cada cajero; una cuenta por persona.
- [ ] Entrega segura de la cuenta de superadministrador (no por correo ni chat).
- [ ] Computadora principal y computadora del cajero, con navegador actualizado.
- [ ] Lector de códigos USB en modo teclado; **probar en la tienda**.
- [ ] Impresora reconocida por el navegador; prueba con hoja de prueba.
- [ ] Internet estable; plan para cuando falle (sin internet no se vende).
- [ ] Datáfono activo y cuenta bancaria para verificar transferencias.
- [ ] Responsable de soporte con teléfono.
- [ ] Lista de precios aprobada por el dueño (D-A).

---

## 5. Cambios realizados en este PR

- Adoptados desde #158 sin modificarlo: plantilla canónica `inventario_importable_ferresystem.csv` (seis columnas), validador `herramientas/validar_plantilla.py` y documentos `00`, `06`, `11` y `README` actualizados allí.
- Nuevos: `08-primer-dia.md`, `09-equipos-y-accesos.md`, `10-capacitacion-30-min.md`, `11-captura-inventario-simple.md`, `00-ENTREGA-PREPARACION.md`.
- Nuevos en este PR: `12-datos-cliente.md`; `plantillas/ejemplo_ficticio_v2.csv` (ejemplo de práctica de seis columnas); `plantillas/precios_para_aprobar_administrador.csv` (hoja de trabajo, no se importa).
- Eliminado: `plantillas/inventario_importable_v2.csv`, duplicado de la plantilla canónica.
- No se modificó ningún archivo de backend, frontend, migraciones ni de otras ramas.

---

## 6. Dependencias concretas de Codex

Codex es el responsable del despliegue técnico. Sin estos puntos no hay día 1:

| # | Dependencia | Estado a 2026-10-13 |
|---|---|---|
| C1 | Decisión de qué candidato se despliega: #153 fusionado en `main`, o #155 sobre #153 | **Sin confirmación en GitHub.** #153 y #155 siguen en borrador y sin cambios desde el 2026-10-11/12. |
| C2 | Entorno de **preproducción** separado, para capacitación con datos ficticios | Pendiente. Necesario para `10-capacitacion-30-min.md`. |
| C3 | Dirección HTTPS del frontend y de la API, con CORS correcto | Pendiente. |
| C4 | Variables de entorno: `NODE_ENV=production`, `JWT_SECRET` propio, `POS_OFFLINE_ENABLED` ausente, `FERRE_MIGRAR_AL_ARRANCAR` ausente | Pendiente de verificación en el hosting. |
| C5 | Respaldo verificado antes de cualquier migración, y estado de la base con `estado-base-solo-lectura.sql` | Pendiente. |
| C6 | Aprobación CODEOWNER de `migration-safe.mjs` y de la migración `20261017000000` | Pendiente. |
| C7 | Confirmación de que el frontend desplegado corresponde al backend (versiones acopladas) | Pendiente. |
| C8 | Lista de funciones disponibles en el despliegue para la verificación final (§7) | Pendiente. |

**Qué no puedo hacer yo:** ejecutar migraciones, desplegar, tocar producción, ni verificar Render, Supabase o Vercel (sin acceso).

---

## 7. Verificación operativa final (cuando Codex confirme)

Se hace en **preproducción** primero. En producción, solo con autorización y con un producto de prueba que el administrador desactive después.

1. Humo de API con `backend/scripts/humo-preproduccion.mjs` (solo lectura en producción).
2. Inicio de sesión de cada rol, con cuenta propia.
3. Crear un producto de prueba (BODEGUERO) y fijar su precio (ADMIN).
4. Venta de contado, cobro en efectivo; comprobar caja y comprobante.
5. Venta con «Cobrar y dejar en bodega»; comprobar que el cajero no puede entregar; entregar con bodeguero; comprobar existencias.
6. Cierre de caja con diferencia y explicación.
7. Revisar auditoría de la venta y de la entrega (usuario, fecha, antes y después).
8. Desactivar el producto de prueba.

Criterio: si un paso falla, no se abre a clientes. Registrar el resultado en `05-lista-verificacion-primer-dia.md`.

---

## 8. Riesgos que quedan abiertos

- **Precio:** el día de inicio depende de que el administrador haya aprobado todos los precios. Con muchos artículos, esto puede tomar más de un día.
- **Internet:** una caída de conexión detiene las ventas.
- **Equipos reales:** lector, cámara, impresora e iPhone no probados.
- **Costo vigente vacío** hasta la primera compra (D-C).
- **Sobrescribir en importación** reemplaza existencias (D-K y D4).
- **Sin respaldo verificado** de producción (dependencia C5).

## 9. Lo que este documento no afirma

- No afirma que el sistema esté desplegado ni que la URL exista.
- No afirma pruebas en dispositivos físicos.
- No afirma aceptación del cliente.
- No contiene costos, precios ni cantidades reales.
