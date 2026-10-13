# 09 · Equipos y accesos

**Alcance:** guía para preparar el equipo. **No he probado ningún dispositivo físico.** Todo lo marcado «verificar» debe comprobarse en la tienda antes del primer día.

---

## 1. Qué necesita cada equipo

| Equipo | Uso | Mínimo recomendado | Estado |
|---|---|---|---|
| Computadora principal (administración y bodega) | Administrar, importar inventario, aprobar precios, entregas | Computadora con navegador actualizado y teclado; pantalla de al menos 1366 px de ancho | Verificar en la tienda |
| Computadora del cajero | Vender, cobrar, cerrar caja | Igual que la principal; no necesita permisos de administrador del equipo | Verificar en la tienda |
| Navegador | Acceso al sistema | Última versión de Chrome o Edge (recomendación; no probado en el equipo real) | Verificar |
| Lector de códigos | Buscar productos por código de barras | Lector USB en modo teclado (escribe el código como si fuera teclado). Verificar que el lector escribe en el campo de búsqueda | **No probado** |
| Cámara para códigos | Lectura por cámara del celular o del equipo | Requiere HTTPS. Sin HTTPS la cámara no funciona; el ingreso manual siempre está disponible | **No probado** en iPhone ni Android |
| Impresora | Comprobantes y cierres | Impresora que el navegador reconozca. El comprobante es una vista imprimible del navegador: **no hay ticket térmico ni PDF** | Verificar |
| Datáfono | Cobros con tarjeta | Del banco. El sistema **no** se conecta al datáfono: el cajero anota la referencia | Fuera del sistema |
| Internet | Todo el sistema | Conexión estable. **Sin internet no se vende** (contingencia apagada) | Verificar y considerar respaldo |

---

## 2. Configuración de la computadora principal

1. Actualizar el sistema operativo y el navegador.
2. Crear un acceso directo al sistema en el escritorio (URL pendiente, ver §4).
3. Permitir ventanas emergentes para la dirección del sistema (necesario para imprimir).
4. Configurar la impresora predeterminada y hacer una impresión de prueba de una **hoja de prueba**, no de un comprobante real.
5. Iniciar sesión con la cuenta del administrador. No dejar la sesión abierta sin supervisión.

## 3. Configuración de la computadora del cajero

1. Igual que la principal, pero sin cuenta de administrador en el sistema.
2. Conectar el lector de códigos y probar: escanear un código de un producto de prueba y comprobar que aparece en el campo de búsqueda.
3. Probar el cobro de una venta de prueba **en el entorno de preproducción**, no con clientes reales.

## 4. Acceso al sistema (dependencias de Codex)

| Dato | Quién lo entrega | Estado |
|---|---|---|
| Dirección de la aplicación (URL del frontend) | Codex (despliegue) | **Pendiente** |
| Dirección de la API (si el frontend la necesita) | Codex | **Pendiente** |
| Cuenta de superadministrador para crear la empresa | Dueño del proyecto | Pendiente de entrega segura (no por correo) |
| Primer administrador de la empresa | Superadministrador, con `POST /super-admin/tenants` y `POST /super-admin/tenants/:tenantId/admins` | Pendiente |
| Contraseñas de cajeros y bodega | Administrador, en Usuarios; usar «Generar contraseña segura» | Al crear cuentas |

**No use el seed de desarrollo** (`backend/prisma/seed.ts`) en producción: crea datos y cuentas de ejemplo.

## 5. Accesos que el dueño debe preparar

- [ ] Dominio o dirección que el cliente usará, con HTTPS.
- [ ] Correo del administrador principal y de cada cajero (uno por persona).
- [ ] Teléfono de soporte y persona responsable de incidentes (pendiente, ver `00` §3).
- [ ] Cuenta del banco para verificar transferencias.
- [ ] Datáfono activo y conocido por el cajero.
- [ ] Respaldo de internet o plan para cuando falle la conexión.

## 6. Lista de verificación en la tienda (marcar en el día)

- [ ] El navegador abre la dirección con candado (HTTPS).
- [ ] Inicio de sesión correcto en ambos equipos.
- [ ] El lector escribe el código en el campo de búsqueda.
- [ ] La impresora imprime una hoja de prueba.
- [ ] La cámara lee un código impreso (si se usará; si no, anotar «no usada»).
- [ ] Se abre caja en un usuario de prueba y se cierra sin dejar datos reales.
