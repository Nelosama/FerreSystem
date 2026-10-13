# Checklist físico del piloto POS offline — Windows y Safari/iPhone

**Estado: NO EJECUTADO.** Este documento es una plantilla para el equipo de pruebas. Ningún paso aquí está marcado como aprobado. Completar cada fila con fecha, responsable, versión del navegador y evidencia (captura o nombre del archivo exportado).

Requisitos previos: el piloto debe estar autorizado según `docs/POS_PILOTO_QA_FINAL.md` §11. Usar un tenant de prueba. **No usar datos de clientes reales.**

## A. Windows (equipo de caja)

Registrar: versión de Windows, Chrome y Edge, modelo del equipo, tipo de disco (SSD/HDD), si tiene UPS.

| # | Paso | Resultado esperado | Estado | Evidencia |
|---|---|---|---|---|
| A1 | Instalar la PWA en Chrome y en Edge desde el sitio del piloto | La app abre en ventana propia | ☐ | |
| A2 | Abrir `/pos-contingencia` con red; registrar el equipo | Aparece código `01` y nombre; ventana descargada | ☐ | |
| A3 | Vender en línea y en efectivo | Venta con correlativo central `V-…` | ☐ | |
| A4 | Desconectar el cable de red; recargar la página | La página carga desde el service worker | ☐ | |
| A5 | Sin red: vender en contingencia (2 ventas) | Mensaje «Venta guardada en este equipo: CT-01-NNNN» | ☐ | |
| A6 | Simular error de disco o cuota (solo en equipo de prueba: llenar la cuota del perfil con archivo grande) | Mensaje «La venta NO se guardó en este equipo»; no se muestra comprobante | ☐ | |
| A7 | Liberar espacio; conectar la red; esperar sincronización (30 s) | Venta pasa a SINCRONIZADA; aparece en `/contingencia-admin` | ☐ | |
| A8 | Cerrar **todas** las pestañas de la app y reabrirla | Sin pérdida de ventas pendientes en el diario | ☐ | |
| A9 | Cerrar el navegador con ventas pendientes (sin red) y reiniciarlo | El diario sobrevive y se envía al reconectar | ☐ | |
| A10 | Abrir la app en dos pestañas | Solo la pestaña operadora puede cobrar | ☐ | |
| A11 | Actualizar el service worker en el servidor de prueba con una versión nueva y abrir la app con una venta pendiente | La versión nueva espera; no se activa durante el cobro | ☐ | |
| A12 | Exportar el diario y revisar el archivo | No contiene tokens ni contraseñas | ☐ | |
| A13 | Reiniciar Windows con ventas pendientes sin red (apagado limpio) | Tras arrancar y reconectar, las ventas se envían una vez | ☐ | |
| A14 | Apagón eléctrico controlado con UPS desconectada durante una venta (protocolo `POS_CONTINGENCIA_PROTOCOLO_APAGON.md`, E1–E9) | Según criterios del protocolo; resultado firmado por el responsable | ☐ | |
| A15 | Revisar tamaño de caché de la app tras 3 actualizaciones | Anotar crecimiento; si es excesivo, abrir incidencia | ☐ | |

Versiones probadas: Windows ______ · Chrome ______ · Edge ______ · Fecha ______ · Responsable ______

## B. Safari / iPhone (administración y PWA)

Registrar: modelo de iPhone, versión de iOS, versión de Safari, si la PWA se instaló desde Safari.

| # | Paso | Resultado esperado | Estado | Evidencia |
|---|---|---|---|---|
| B1 | Abrir `/admin-movil` en Safari (ADMIN) a 390 px | Sin desbordamiento horizontal; 16 px de margen | ☐ | |
| B2 | Abrir `/contingencia-admin` en Safari | Lista legible; botones táctiles de al menos 44 px | ☐ | |
| B3 | Resolver una revisión con nota de 10 caracteres | Estado cambia; nota visible | ☐ | |
| B4 | Instalar la PWA (Compartir → Añadir a inicio) | Icono y nombre correctos | ☐ | |
| B5 | Abrir la PWA instalada sin red | Carga el shell; la API responde con error claro | ☐ | |
| B6 | Girar el iPhone a horizontal y volver | Sin pérdida de formulario ni de sesión | ☐ | |
| B7 | Bloquear el iPhone durante una venta pendiente y desbloquear | El diario conserva la venta | ☐ | |
| B8 | Cerrar Safari desde el selector de apps con ventas pendientes y reabrir | Ventas pendientes siguen en el diario | ☐ | |
| B9 | Sesión vencida (esperar o forzar expiración) y volver a entrar | La venta pendiente no se borra; se envía al volver a iniciar sesión | ☐ | |
| B10 | Probar con datos móviles y con Wi-Fi: cambiar de red durante una sincronización | Sin duplicados (mismo UUID; verificar en admin) | ☐ | |
| B11 | Cámara trasera para escaneo (si aplica al piloto) | Captura manual disponible si la cámara se deniega | ☐ | |

Versiones probadas: iOS ______ · Safari ______ · Modelo ______ · Fecha ______ · Responsable ______

## C. Impresión térmica (hardware real)

Registrar: marca y modelo de la impresora, ancho del papel (58 u 80 mm), conexión (USB, red, Bluetooth), controlador instalado, escala del diálogo (100 %) y márgenes (ninguno).

| # | Paso | Resultado esperado | Estado | Evidencia |
|---|---|---|---|---|
| C1 | Imprimir un comprobante con papel de 80 mm (selector del POS en 80 mm) | Ancho completo sin cortar texto; producto, cantidades, precios, total, efectivo y cambio legibles | ☐ | |
| C2 | Repetir con papel de 58 mm (selector en 58 mm) | Sin cortes laterales; líneas de producto completas | ☐ | |
| C3 | Cancelar el diálogo de impresión | La venta sigue en «Ventas guardadas»; no aparece error ni se pide cobrar | ☐ | |
| C4 | Impresora apagada o sin papel al pulsar «Imprimir» | Aviso «No se pudo imprimir»; la venta sigue guardada; el cajero atiende al siguiente cliente | ☐ | |
| C5 | Reimprimir desde «Ventas guardadas» después de C4 | Mismo comprobante (mismo CT); no aparece una venta nueva | ☐ | |
| C6 | Cerrar y reabrir el navegador, luego reimprimir una venta del día | Comprobante idéntico al original | ☐ | |
| C7 | Imprimir desde iPhone/iPad con AirPrint (si el piloto lo usa) | Comprobante legible; no se imprime la barra del navegador | ☐ | |
| C8 | Verificar que el comprobante dice «COMPROBANTE INTERNO DE CONTINGENCIA» y «NO ES FACTURA FISCAL» | Texto visible en el papel | ☐ | |

**Qué no prueba la automatización:** el navegador no informa si la impresora recibió el trabajo ni si el usuario canceló el diálogo. Por eso C3 a C5 solo se validan a mano. La automatización (`frontend/e2e/contingencia-simulado.spec.ts`) sustituye `window.print` y prueba que una falla o cancelación no revierte la venta.

## C. Criterios de aceptación de este checklist

- Cada fila con estado ✅ y evidencia. Cualquier ✖ detiene el piloto hasta corregir o aceptar el riesgo por escrito.
- Ninguna venta pendiente perdida, duplicada o sin conciliar.
- Diferencia de caja explicada en cada cierre.
- Resultado firmado por el responsable de pruebas y el dueño del negocio.

**No sustituye:** la aprobación fiscal (D1), los límites comerciales ni la revisión de la conciliación por el contador.
