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
| Cerrar/reabrir con permiso pendiente hacía dos `getUserMedia`. | Segunda prueba nueva obtiene 2 solicitudes frente a 1. | Compartir exclusivamente la solicitud pendiente; solo su último consumidor recibe el stream. Cerrar/expirar libera también streams tardíos. Tras agotar 30 s, el reintento puede crear una petición nueva sin quedar ligado a la que dejó de responder. |
| Permiso, `video.play`, carga del lector y `detect()` podían quedar sin resolver. | Promesas deliberadamente pendientes, reloj simulado. | Límites cancelables: 30 s permiso, 15 s vídeo/carga, 5 s lectura. Cerrar no espera esas promesas. La solicitud de permiso del navegador no puede cancelarse por JavaScript. |
| Pista terminada o vídeo sin avance no daban error útil. | Eventos `ended`, `readyState=0` y reloj simulado. | Aviso de interrupción; watchdog de 15 s sin fotogramas/avance; nueva apertura explícita. |
| Plegar la sección de cámara de Inventario ocultaba el vídeo, sin desmontarlo ni detener las pistas. | Prueba de `<details>`, además de cerrar modal/navegar. | Escuchar el cierre de esa sección y detener la activación. |
| UPC-E no estaba solicitado en ninguno de los lectores. Habilitarlo en ZXing 0.23.0 no basta. | Imagen válida `04252614`: el lector UPC-E incluido falla; el adaptador la lee. | Formato nativo `upc_e` y adaptador local limitado a UPC-E. |

La línea base de las primeras nueve pruebas de ciclo daba **2 aprobadas / 7 fallidas**. Registro: `evidencias/scanner-20261018/baseline-lifecycle.log`.

### Decisión sobre ZXing

Se conserva `@zxing/library@0.23.0`: sus lecturas EAN-13, EAN-8, UPC-A y Code 128 pasan con imágenes sintéticas y la biblioteca real (sin mocks de lector). Safari sin `BarcodeDetector` carga este módulo local de forma diferida. Android/escritorio conservan detección por capacidades y fallback si falta soporte o falla el detector, sin identificación por user-agent.

El lector UPC-E incluido es experimental y presenta defectos verificables en el paquete instalado: devuelve un número donde el padre espera `{rowOffset,resultString}`, no devuelve el texto acumulado, el padre usa guard/checksum EAN, la expansión compara códigos ASCII con dígitos y la última paridad del sistema 1 está incorrecta. Cambiar a `@zxing/browser` no corrige ese núcleo compartido. Reemplazar toda la biblioteca o incorporar WASM añadiría dependencias y riesgos para cuatro formatos que ya pasan.

`upceReader.ts` usa las funciones existentes de muestreo de filas, patrones, matching y checksum de ZXing; implementa guard final, paridad y expansión UPC-E. Valida el checksum expandido, pero devuelve los **ocho caracteres originales**, conservando ceros iniciales. No escribe ni convierte códigos del catálogo. La prueba del lector upstream queda como evidencia fijada a la versión actual; revisar/eliminar el adaptador y esa prueba al actualizar la biblioteca.

### Cámara, Safari y PWA

- `getUserMedia` solo comienza al abrir el escáner; no enumera dispositivos ni pide una cámara preliminar. Conserva `audio:false`, `facingMode:{ideal:'environment'}` y resolución ideal 1280×720, con 24 fps ideales y máximo 30. `ideal` permite webcams de escritorio; no garantiza por sí solo qué lente elegirá iOS en equipos con varias cámaras. Eso requiere comprobación física.
- `muted`, `autoPlay` y `playsInline` están en el vídeo. Se solicita enfoque continuo solo cuando la pista declara soportarlo; si lo rechaza, se conserva el enfoque predeterminado. No se ha demostrado un fallo de enfoque del cliente.
- Canvas limitado a 1280 píxeles en su lado mayor, incluso en orientación vertical. No se redimensiona en cada frame. ZXing reutiliza sus lectores mediante `setHints`/`decodeWithState`. UPC-E comprueba primero la fila central y conserva la búsqueda completa para etiquetas fuera del centro o invertidas. Bucle secuencial, una sola lectura aceptada por apertura y espera de 250 ms entre intentos; no se solapan decodificaciones.
- Los límites de promesas no pueden interrumpir JavaScript síncrono que ya está ejecutándose. No se acredita velocidad, uso térmico ni ausencia de pausas en un iPhone real con este ensayo.
- `visibilitychange`/`pagehide` detienen y cierran; al regresar el usuario pulsa el mismo botón para reabrir. No se abre la cámara en segundo plano ni al recuperar BFCache. Escape, cierre, plegado, deshabilitación y desmontaje limpian la sesión.
- La PWA usa el mismo componente y origen HTTPS; el manifiesto existente es `standalone`. El service worker conserva su política (solo shell/recursos estáticos, API sin caché). No se modifica el comportamiento offline: el inventario sigue necesitando conexión y sesión válida. El chunk ZXing se descarga la primera vez que se requiere; sin red/caché puede fallar y debe permitir captura manual.
- Se conservan mensajes ES/EN de permiso denegado, cámara ocupada/no disponible, HTTPS y navegador sin soporte; se añaden espera agotada e interrupción. Los errores desconocidos tienen un mensaje traducido, no una excepción técnica sin traducir.

## Interfaz

Vídeo adaptable sin recortar el fotograma, marco orientativo (no limita el área decodificada), indicador discreto con respeto por movimiento reducido, confirmación verde con el código, cierre visible con área táctil de 44 px y opción manual que enfoca el campo ya existente en inventario/levantamiento. No hay formulario duplicado ni pantalla nueva. Escanear identifica o llena un código: no guarda conteos ni crea productos por sí solo.

## Cierre del PR #176 — 2026-10-17, America/Tegucigalpa

La revisión de cierre continúa exclusivamente en la misma rama y PR. No se encontraron nuevos defectos de producción demostrables: se conservan las correcciones anteriores y se completa la cobertura de aceptación que faltaba:

- Diez aperturas/cierres consecutivos, verificando una solicitud y una liberación por ciclo; una apertura adicional para captura manual.
- Lecturas consecutivas con UPC-A, UPC-E y Code 128 que conservan ceros iniciales; código desconocido sin altas ni aplicación automática de inventario.
- Permiso denegado, búsqueda manual y nueva apertura después de permitir la cámara.
- Sesión vencida con cámara activa y formulario sin guardar: renovación rechazada, login, pistas liberadas, cero búsquedas tardías y cero escrituras de conteo/aplicación.
- Consumidor POS del componente compartido: una lectura por apertura, cantidades y totales existentes conservados; la segunda apertura explícita permite otra unidad. No se envían ventas, cobros ni operaciones de caja y no se cambia código del POS.

Estas E2E simulan medios y servidor. La decodificación real de los cinco formatos se verifica por separado con ZXing e imágenes sintéticas; no constituye prueba de cámara física. La primera ejecución de cierre dio 17 aprobadas/1 fallo: el nuevo test interceptaba `/auth/me` sin incluir su query `_session`, por lo que no provocaba la expiración. Se corrigió únicamente la ruta del test y el escenario focalizado pasó. Resultados finales y checks del SHA publicado en el [PR #176](https://github.com/Nelosama/FerreSystem/pull/176).

## Validación

Verificaciones sobre el código final, antes de la publicación del cierre:

| Comando | Resultado | Qué acredita |
|---|---|---|
| `cd frontend && npm test` | **443/443**, 0 omitidas | Regresión unitaria completa, con lectores reales e imágenes sintéticas. |
| `node --test frontend/test/barcode-camera-lifecycle.test.mjs frontend/test/barcode-decoder-real.test.mjs frontend/test/barcode-scanner.test.mjs` | **90/90** | 20 de ciclo/selección de lector, 46 del decodificador real y 24 previas. |
| `cd frontend && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser -- --workers=2 levantamiento.spec.ts productos-edicion.spec.ts pos-catalogo-grande-simulado.spec.ts session-lifecycle.spec.ts` | **49/49**, sin reintentos | Regresión de inventario, cámara compartida/POS y sesiones, con medios/API simulados. |
| `cd frontend && npm run lint` | **0 errores**, 116 avisos | Avisos existentes de hooks/refs/variables; no se amplía el alcance para reformatear o corregir pantallas ajenas. |
| `cd frontend && VITE_API_URL=/api npm run build` | **Correcto**, incluye `tsc -b` | TypeScript y bundle de producción. Aviso previo de tamaño de chunk PDF. |
| `cd backend && npx vitest run src/levantamientos/levantamientos.service.spec.ts src/productos/productos-security.http.spec.ts src/productos/importacion-productos.spec.ts` | **81/81**, 3 archivos | Regresión de conteo, permisos y contrato de importación; no es persistencia PostgreSQL. |

No se modificó código de backend, por lo que no se repitieron localmente su build/lint completos ni la integración PostgreSQL. Los workflows existentes del PR ejecutan esas verificaciones y el piloto real en sus propios entornos; consultar su SHA y conclusión antes de atribuirlos al HEAD final.

Se midió el mismo UPC-E centrado en un frame 1280×720: antes de la comprobación central, 731/884/846 ms; después, 91/84/89 ms con carga y 9/13/8 ms en la pasada focalizada. Son observaciones del ejecutor Linux, sin umbral de rendimiento en los tests y **sin extrapolación a iPhone**. El decodificador sigue comprobando imágenes fuera del centro e invertidas.

La primera pasada focalizada de navegador fue 29 aprobadas / 1 fallo de un selector nuevo (buscaba el botón de inicio cuando su texto ya había cambiado a Detener). Se corrigió el selector, no la aserción de liberación. Una ejecución amplia paralela con unitarias y compilación se detuvo: 102 aprobadas, 3 fallos de espera en navegación sin escáner abierto, 2 interrumpidas y 78 sin ejecutar. Se conserva ese registro y se ejecuta la suite completa sin carga paralela. No se presenta aquella pasada como aprobada. El cierre de esa regresión de navegador y los checks asociados a cada SHA se publican en el [PR único #176](https://github.com/Nelosama/FerreSystem/pull/176); no atribuir a un commit los checks de otro.

 Evidencia de navegador usa APIs y backend simulados; la prueba de software sí carga el chunk ZXing y decodifica píxeles mediante canvas real, con una imagen sintética en lugar de cámara.

La instalación local de WebKit 26.6 fue rechazada por el proxy con **HTTP 403 Domain forbidden** en los destinos de descarga de Playwright. No se presenta ese intento como una prueba Safari aprobada. **No hay acceso a un iPhone físico ni a una PWA instalada en iOS en este entorno.**

## Comprobación obligatoria en iPhone real

Usar una instalación de prueba HTTPS autorizada que contenga el **SHA final indicado en el PR #176**, con usuario y levantamiento de prueba. Una instalación productiva del código anterior no valida este PR. Los previews automáticos de esta rama siguen deshabilitados: si no existe un entorno HTTPS con ese SHA, el propietario debe autorizar primero un preview temporal o staging separado; no se ha creado ni desplegado ninguno en este trabajo. Publicar este PR no autoriza desplegarlo. Repetir toda la secuencia en Safari y después desde el icono de la PWA instalada; registrar modelo, versión iOS, versión de la aplicación/commit y resultado de cada paso.

1. Con un ADMIN/BODEGUERO autorizado, abrir Levantamiento → Contar producto → Leer código con cámara. Aceptar permiso. Confirmar cámara trasera por la imagen real, vista dentro del ancho, controles accesibles y enfoque de una etiqueta impresa a 15–30 cm. Registrar lente/distancia/iluminación si no enfoca.
2. Abrir/detener **10 veces**, sin recargar. Tras cada cierre, confirmar que desaparece el indicador de cámara de iOS. Reabrir; comprobar que no aparecen solicitudes innecesarias (Safari conserva la decisión según su propia configuración).
3. Leer etiquetas EAN-13 `5901234123457`, EAN-8 `96385074`, UPC-A `012345678905`, UPC-E `04252614` y Code 128 `123456`. Deben conservarse texto y ceros; una apertura debe producir una sola confirmación/búsqueda. Registrar tiempo hasta la lectura; objetivo operativo sugerido ≤2 s con buena luz, **aún sin acreditar**.
4. Alternar dos productos registrados, mantener cada etiqueta en el encuadre unos segundos y confirmar una sola selección por apertura. El escáner no guarda conteos. Guardar solo un conteo de prueba conscientemente; el mismo producto ya contado debe conservar la protección de duplicados y no sumar unidades silenciosamente.
5. Probar un código válido no registrado, un EAN con checksum alterado y una etiqueta ilegible. El desconocido informa sin crear producto; el inválido no se acepta; cerrar siempre queda disponible. Elegir Introducir código manualmente y buscar en el campo existente, sin pedir cámara.
6. Denegar cámara desde un permiso nuevo/configuración del sitio: mensaje claro en español y captura manual funcional. Cambiar a permitir y reabrir sin recargar si Safari lo admite; registrar si la propia configuración exige recarga. Probar esperar >30 s sin responder al permiso, cerrar/reabrir y luego aceptar: ningún stream oculto ni lectura tardía.
7. Con cámara abierta, cambiar de app, bloquear/desbloquear el teléfono y volver, cada acción por separado. La vista debe estar cerrada; reabrir con el mismo botón. Probar Atrás/Adelante y navegar a Inicio y de vuelta. Confirmar cámara detenida al salir, sesión conservada cuando sigue vigente y ausencia de lecturas tardías.
8. En Inventario → Nuevo producto → cámara, plegar su sección y cerrar el modal mientras arranca y mientras detecta. Confirmar indicador apagado y reapertura posible; el formulario no se envía ni se pierde su captura manual.
9. Repetir lectura/cierre con giro vertical/horizontal, luz baja y etiquetas del cliente. Registrar errores y vídeos de reproducción sin datos sensibles. Repetir controles básicos en Android y escritorio con webcam.
10. En una cuenta de prueba, pedir al administrador que la desactive desde Personal y permisos en un segundo dispositivo (revoca sus sesiones; reactivarla al terminar) mientras el escáner está abierto y hay datos sin guardar; volver a enfocar Safari/PWA. Debe pedir login al validar/renovar, apagar la cámara y no enviar el conteo ni aplicar inventario. No esperar que se conserven datos sin enviar tras una sesión irrecuperable. Repetir un cambio de app con sesión todavía válida: debe conservarse el acceso y permitir reabrir la cámara.

Aceptación física: **sin ejecutar**. No declarar el incidente del cliente resuelto hasta completar ese registro.

## Archivos de implementación y pruebas

- `frontend/src/utils/barcodeScanner.ts`: adquisición, límites, ciclo y errores.
- `frontend/src/utils/zxingDecoder.ts` y `upceReader.ts`: decodificación, rendimiento y UPC-E.
- `frontend/src/components/BarcodeScanner.tsx` y `.css`: controles, cierre, guía y confirmación.
- `frontend/src/components/LevantamientoProductLookup.tsx` y `frontend/src/pages/InventarioPage.tsx`: enfocar el campo manual ya existente.
- `frontend/src/locales/{es,en}.json`: textos nuevos.
- `frontend/test/barcode-camera-lifecycle.test.mjs`, `barcode-decoder-real.test.mjs`, `barcode-scanner.test.mjs`: regresiones y ajuste del mock a la API reutilizable del lector.
- `frontend/e2e/scanner-camera.fixture.ts`, `levantamiento.spec.ts`, `productos-edicion.spec.ts` y `pos-catalogo-grande-simulado.spec.ts`: medios simulados, canvas real y regresión de formularios.
- `frontend/vercel.json` y `frontend/test/vercel-pilot-guard.test.mjs`: impedir previews de esta rama, verificando que otras ramas conservan su política.
- `docs/CONTEXTO_MAESTRO.md`, este informe y `docs/evidencias/scanner-20261018/`: continuidad y evidencia.
