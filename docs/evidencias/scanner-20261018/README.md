# Evidencia del escáner, 2026-10-18 UTC

Código y protocolo: [informe](../../ESCANER_IPHONE_20261018.md). PR único [#176](https://github.com/Nelosama/FerreSystem/pull/176).

- Node 24.19.0, Playwright 1.63.0, Chromium del sistema 151.0.7922.173, Linux.
- `baseline-lifecycle.log`: 2/9 pasan; 7 fallos reproducidos contra main antes de editar la cámara.
- `retry-before.log`: reproducción posterior del reintento que seguía ligado a una solicitud ya agotada; corregido y cubierto en la suite final.
- `focused-final.log`: 90/90; cámara simulada y biblioteca ZXing real con píxeles sintéticos. Incluye diagnóstico de tiempo con la comprobación UPC-E central (9/13/8 ms).
- `unit-final.log`: 443/443, sin omitidas, sobre las fuentes finales.
- `build-final.log`: tsc y Vite correctos con `VITE_API_URL=/api`.
- `lint-final.log`: 0 errores, 116 avisos.
- `backend-inventory-unit-final.log`: 81/81, solo regresiones relacionadas, sin base de datos real.
- `perf-before.log`: diagnóstico anterior de UPC-E centrado 1280×720 (731/884/846 ms). No representa rendimiento de un iPhone.
- `browser-inventory.log`: 29 aprobadas y un selector nuevo incorrecto (corregido). No es el cierre de navegador.
- `browser-concurrent-interrupted.log`: 102 pasan/3 fallan/2 interrumpidas/78 sin ejecutar bajo carga concurrente; se conserva sin convertirlo en resultado aprobado.
- `webkit-install.log`: WebKit no descargable por HTTP 403; sin validación Safari local.
- `scanner-390-simulado.png`: captura de la interfaz a 390 px, con medios simulados; no es fotografía de un dispositivo ni prueba óptica.

El resultado de la repetición completa sin carga paralela y los workflows del HEAD publicado se registran en el PR. El log local de cierre queda en `/workspace/scanner-evidence/browser-final.log`. Las pruebas de cámara de navegador simulan MediaStream/BarcodeDetector; la prueba de fallback sí usa canvas y ZXing reales con una etiqueta sintética. No acreditan Safari físico ni PWA instalada.

Los logs archivados normalizan color ANSI, espacios finales y líneas vacías al final; conservan mensajes y resultados. `SHA256SUMS` permite comprobar los archivos de esta carpeta. No hubo merge, despliegue, cambios de datos, dependencias, migraciones ni autenticación.
