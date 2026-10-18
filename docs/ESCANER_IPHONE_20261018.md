# Escáner de cámara — diagnóstico y corrección, 2026-10-18 UTC

Corrección implementada; aceptación en iPhone físico **PENDIENTE**. No se conoce el síntoma concreto del dispositivo del cliente y no se le atribuye una causa única sin reproducción física.

## Base y alcance

- Base: `main` `174cce1949cbdc5eff8f36fed6e87190ff58c373`, árbol local limpio al comenzar. GitHub solo tenía `main` y ningún PR abierto. Rama única: `codex/fix-camera-lifecycle-ios`.
- Revisados PR #76 (integrado), historial de `BarcodeScanner`, #105 (errores entre realms, traducciones, lector real y captura manual), integración de inventario y estado actual de sesiones. #76 dejó explícitamente pendiente Safari/iPhone físico; sus comprobaciones de atributos no prueban cámara real.
- Superficie: escáner compartido, lookup de levantamiento, foco del campo manual de Inventario, traducciones y pruebas. Sin cambios de backend, reglas de conteo, datos, autenticación, ventas, cobros, caja, dependencias o migraciones. El POS existente consume el mismo componente: se ejecuta regresión del frontend, sin modificar su página ni sus reglas. La app móvil sigue siendo administrativa/de inventario.
- `frontend/vercel.json` excluye **solo esta rama** de previews automáticas, conforme a la prohibición de desplegar. No cambia el despliegue de otras ramas.

## Evidencia y causas comprobadas

| Hallazgo | Reproducción | Corrección |
|---|---|---|
| `stop()` repetido invocaba `track.stop()` más de una vez. | Primera prueba nueva falla con 2 frente a 1. | Limpieza idempotente de pistas, vídeo, temporizadores y listeners. |
| Cerrar/reabrir con permiso pendiente hacía dos `getUserMedia`. | Segunda prueba nueva obtiene 2 solicitudes frente a 1. | Compartir exclusivamente la solicitud pendiente; solo su último consumidor recibe el stream. Cerrar/expirar libera también streams tardíos. |
| Permiso, `video.play`, carga del lector y `detect()` podían quedar sin resolver. | Promesas deliberadamente pendientes, reloj simulado. | Límites cancelables: 30 s permiso, 15 s vídeo/carga, 5 s lectura. Cerrar no espera esas promesas. La solicitud de permiso del navegador no puede cancelarse por JavaScript. |
| Pista terminada o vídeo sin avance no daban error útil. | Eventos `ended`, `readyState=0` y reloj simulado. | Aviso de interrupción; watchdog de 15 s sin fotogramas/avance; nueva apertura explícita. |
| Plegar la sección de cámara de Inventario ocultaba el vídeo, sin desmontarlo ni detener las pistas. | Prueba de `<details>`, además de cerrar modal/navegar. | Escuchar el cierre de esa sección y detener la activación. |
| UPC-E no estaba solicitado en ninguno de los lectores. Habilitarlo en ZXing 0.23.0 no basta. | Imagen válida `04252614`: el lector UPC-E incluido falla; el adaptador la lee. | Formato nativo `upc_e` y adaptador local limitado a UPC-E. |

La línea base de las primeras nueve pruebas de ciclo daba **2 aprobadas / 7 fallidas**. Registro: `evidencias/scanner-20261018/baseline-lifecycle.log`.

### Decisión sobre ZXing

Se conserva `@zxing/library@0.23.0`: sus lecturas EAN-13, EAN-8, UPC-A y Code 128 pasan con imágenes reales en memoria (no mocks de lector). Safari sin `BarcodeDetector` carga este módulo local de forma diferida. Android/escritorio conservan detección por capacidades y fallback si falta soporte o falla el detector, sin identificación por user-agent.

El lector UPC-E incluido es experimental y presenta defectos verificables en el paquete instalado: devuelve un número donde el padre espera `{rowOffset,resultString}`, no devuelve el texto acumulado, el padre usa guard/checksum EAN, la expansión compara códigos ASCII con dígitos y la última paridad del sistema 1 está incorrecta. Cambiar a `@zxing/browser` no corrige ese núcleo compartido. Reemplazar toda la biblioteca o incorporar WASM añadiría dependencias y riesgos para cuatro formatos que ya pasan.

`upceReader.ts` usa las funciones existentes de muestreo de filas, patrones, matching y checksum de ZXing; implementa guard final, paridad y expansión UPC-E. Valida el checksum expandido, pero devuelve los **ocho caracteres originales**, conservando ceros iniciales. No escribe ni convierte códigos del catálogo. La prueba del lector upstream queda como evidencia fijada a la versión actual; revisar/eliminar el adaptador y esa prueba al actualizar la biblioteca.

### Cámara, Safari y PWA

- `getUserMedia` solo comienza al abrir el escáner; no enumera dispositivos ni pide una cámara preliminar. Conserva `audio:false`, `facingMode:{ideal:'environment'}` y resolución ideal 1280×720, con 24 fps ideales y máximo 30. `ideal` permite webcams de escritorio; no garantiza por sí solo qué lente elegirá iOS en equipos con varias cámaras. Eso requiere comprobación física.
- `muted`, `autoPlay` y `playsInline` están en el vídeo. Se solicita enfoque continuo solo cuando la pista declara soportarlo; si lo rechaza, se conserva el enfoque predeterminado. No se ha demostrado un fallo de enfoque del cliente.
- Canvas limitado a 1280 píxeles en su lado mayor, incluso en orientación vertical. No se redimensiona en cada frame. ZXing reutiliza sus lectores mediante `setHints`/`decodeWithState`. Bucle secuencial, una sola lectura aceptada por apertura y espera de 250 ms entre intentos; no se solapan decodificaciones.
- Los límites de promesas no pueden interrumpir JavaScript síncrono que ya está ejecutándose. No se acredita velocidad, uso térmico ni ausencia de pausas en un iPhone real con este ensayo.
- `visibilitychange`/`pagehide` detienen y cierran; al regresar el usuario pulsa el mismo botón para reabrir. No se abre la cámara en segundo plano ni al recuperar BFCache. Escape, cierre, plegado, deshabilitación y desmontaje limpian la sesión.
- La PWA usa el mismo componente y origen HTTPS; el manifiesto existente es `standalone`. El service worker conserva su política (solo shell/recursos estáticos, API sin caché). No se modifica el comportamiento offline: el inventario sigue necesitando conexión y sesión válida. El chunk ZXing se descarga la primera vez que se requiere; sin red/caché puede fallar y debe permitir captura manual.
- Se conservan mensajes ES/EN de permiso denegado, cámara ocupada/no disponible, HTTPS y navegador sin soporte; se añaden espera agotada e interrupción. Los errores desconocidos tienen un mensaje traducido, no una excepción técnica sin traducir.

## Interfaz

Vídeo adaptable sin recortar el fotograma, marco orientativo (no limita el área decodificada), indicador discreto con respeto por movimiento reducido, confirmación verde con el código, cierre visible con área táctil de 44 px y opción manual que enfoca el campo ya existente en inventario/levantamiento. No hay formulario duplicado ni pantalla nueva. Escanear identifica o llena un código: no guarda conteos ni crea productos por sí solo.

## Validación

Resultados finales y comandos en la sección de cierre de este informe. Evidencia de navegador usa APIs y backend simulados; la prueba de software sí carga el chunk ZXing y decodifica píxeles mediante canvas real, con una imagen sintética en lugar de cámara.

La instalación local de WebKit 26.6 fue rechazada por el proxy con **HTTP 403 Domain forbidden** en los destinos de descarga de Playwright. No se presenta ese intento como una prueba Safari aprobada. **No hay acceso a un iPhone físico ni a una PWA instalada en iOS en este entorno.**

## Comprobación obligatoria en iPhone real

Usar una instalación de prueba HTTPS autorizada y un levantamiento de prueba. Publicar este PR no autoriza desplegarlo. Repetir toda la secuencia en Safari y después desde el icono de la PWA instalada; registrar modelo, versión iOS, versión de la aplicación/commit y resultado de cada paso.

1. Con un ADMIN/BODEGUERO autorizado, abrir Levantamiento → Contar producto → Leer código con cámara. Aceptar permiso. Confirmar cámara trasera por la imagen real, vista dentro del ancho, controles accesibles y enfoque de una etiqueta impresa a 15–30 cm. Registrar lente/distancia/iluminación si no enfoca.
2. Abrir/detener **10 veces**, sin recargar. Tras cada cierre, confirmar que desaparece el indicador de cámara de iOS. Reabrir; comprobar que no aparecen solicitudes innecesarias (Safari conserva la decisión según su propia configuración).
3. Leer etiquetas EAN-13 `5901234123457`, EAN-8 `96385074`, UPC-A `012345678905`, UPC-E `04252614` y Code 128 `123456`. Deben conservarse texto y ceros; una apertura debe producir una sola confirmación/búsqueda. Registrar tiempo hasta la lectura; objetivo operativo sugerido ≤2 s con buena luz, **aún sin acreditar**.
4. Alternar dos productos registrados, mantener cada etiqueta en el encuadre unos segundos y confirmar una sola selección por apertura. El escáner no guarda conteos. Guardar solo un conteo de prueba conscientemente; el mismo producto ya contado debe conservar la protección de duplicados y no sumar unidades silenciosamente.
5. Probar un código válido no registrado, un EAN con checksum alterado y una etiqueta ilegible. El desconocido informa sin crear producto; el inválido no se acepta; cerrar siempre queda disponible. Elegir Introducir código manualmente y buscar en el campo existente, sin pedir cámara.
6. Denegar cámara desde un permiso nuevo/configuración del sitio: mensaje claro en español y captura manual funcional. Cambiar a permitir y reabrir sin recargar si Safari lo admite; registrar si la propia configuración exige recarga. Probar esperar >30 s sin responder al permiso, cerrar/reabrir y luego aceptar: ningún stream oculto ni lectura tardía.
7. Con cámara abierta, cambiar de app, bloquear/desbloquear el teléfono y volver, cada acción por separado. La vista debe estar cerrada; reabrir con el mismo botón. Probar Atrás/Adelante y navegar a Inicio y de vuelta. Confirmar cámara detenida al salir, sesión conservada cuando sigue vigente y ausencia de lecturas tardías.
8. En Inventario → Nuevo producto → cámara, plegar su sección y cerrar el modal mientras arranca y mientras detecta. Confirmar indicador apagado y reapertura posible; el formulario no se envía ni se pierde su captura manual.
9. Repetir lectura/cierre con giro vertical/horizontal, luz baja y etiquetas del cliente. Registrar errores y vídeos de reproducción sin datos sensibles. Repetir controles básicos en Android y escritorio con webcam.

Aceptación física: **sin ejecutar**. No declarar el incidente del cliente resuelto hasta completar ese registro.
