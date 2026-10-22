# UX ronda 1 (PR #188) — evidencia antes/después

- **Antes:** `main` `7914d1b` (incluye #183). **Después:** rama `claude/ux-ronda1-pos-marca` (estado final del PR #188).
- **Cómo se generó:** `UX_CAPTURAS=<carpeta> npx playwright test e2e/ux-capturas.spec.ts` con el backend simulado de
  `e2e/ux-auditoria.fixture.ts` (datos de ejemplo, sin datos reales). Chromium 1194 del entorno, sin WebKit ni
  dispositivo físico. Capturas reducidas a 256 colores para el repositorio.
- **Mediciones:** `mediciones.json`. Contraste WCAG 2.2 calculado en el navegador para cada texto visible contra su
  fondo efectivo (fondos semitransparentes y opacidad acumulada incluidos; mínimo 4.5:1, o 3:1 en texto grande);
  se excluyen solo los controles deshabilitados. «Desborde» = píxeles de scroll horizontal de la página.

| Pantalla @ancho | Textos bajo el mínimo (antes → después) | Peor caso antes | Desborde después |
| --- | --- | --- | --- |
| Login @1440 / @390 | 3 → 0 / 3 → 0 | «Jowa» 1.0:1 (blanco sobre blanco); texto SAR 2.52:1 | 0 |
| Modal de usuarios @1440 / @390 | 16 → 0 / 14 → 0 | claves de permiso 1.09:1 | 0 |
| POS @1440 / @1024 / @390 | 21 → 0 / 21 → 0 / 19 → 0 | método «EFECTIVO» seleccionado 1.0:1 | 0 |
| POS marca clara #F5C400 @1440 | 22 → 0 | «EFECTIVO» 1.0:1; enlaces 1.43:1 | 0 |
| Inicio @1440 / @390 | 5 → 0 / 3 → 0 | «Inicio» 3.07:1; «Nueva venta» 3.56:1 | 0 |
| Inventario @1440 / @390 | 10 → 0 / 8 → 0 | filtro «TODAS» 1.09:1 | 0 |
| TOPNAV @1024 | 5 → 0 | «Jowa System» 3.56:1 | 0 |
| Super Admin @1440 / @390 | 3 → 0 / 3 → 0 | «Iniciar soporte» 3.56:1 | 0 |

Archivos: `antes/<pantalla>-<ancho>.png` y `despues/<pantalla>-<ancho>.png` (mismos nombres).

Límites: emulación de escritorio y móvil en Chromium; no sustituye Safari/iPhone, tableta física ni la revisión con
usuarios reales. Las capturas de página completa muestran los elementos fijos (navegación inferior, botón flotante)
en la posición del viewport inicial.
