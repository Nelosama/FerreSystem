# PR #166 — discrepancia de recarga offline e integración pendiente

2026-10-15 UTC. Trabajo sobre `codex/auditoria-precision-monetaria`, desde `afd14930`. Sin nuevas ramas ni PR, merge de PR ni despliegue.

## GitHub Actions de afd14930

- [Operación de ferretería / validate y guard](https://github.com/Nelosama/FerreSystem/actions/runs/38787416120): **success**. Navegador simulado 146/146; backend 458/458; integración PostgreSQL 940/940 en 58 archivos y otro comando de seis pruebas aprobado. Todas las etapas del job finalizaron correctamente.
- [Piloto con API y PostgreSQL reales](https://github.com/Nelosama/FerreSystem/actions/runs/38787415981): **success**, 141 aprobadas/10 omitidas existentes; incluye recarga offline (`contingencia-real.spec.ts:185`), reconexión, respaldo, recuperación y ensayo de actualización/reversión.

Estos resultados pertenecen exactamente a `afd14930`; los checks del commit posterior con la prueba diagnóstica se publican en #166.

## Causa observada

**Del entorno de emulación, no de la aritmética ni de React/Jowa.** Localmente se forzó `/usr/bin/chromium`, versión **151.0.7922.173**; Playwright **1.63.0** requiere su Chromium **153.0.8010.12**, revisión **1243**, que sí instaló y utilizó CI.

Se aisló el fenómeno con un servidor HTTP local, HTML mínimo y un service worker real, sin cargar Jowa, React, IndexedDB de ventas ni API de negocio. El SW no intercepta `/api/`:

| Paso local, Chromium 151 | navigator.onLine | API sin caché |
| --- | --- | --- |
| En línea, SW controla la página | true | 200, una petición recibida |
| `context.setOffline(true)` | false | — |
| Recargar desde el SW | **true** | **NETWORK_ERROR**, el servidor sigue con una sola petición |
| Tres segundos después | **true**, sin evento offline nuevo | Sigue bloqueada |
| Reconectar | true | El emulador vuelve a habilitar la red |

Se reproduce tanto con el lanzador `/usr/bin/chromium` como con el binario directo `/usr/lib/chromium/chromium`, descartando el script de Debian como causa. La contradicción persiste sin código de aplicación: la emulación bloquea la API pero pierde el estado offline del documento al recargar. No se presenta esto como una prueba de fallo con desconexión física ni como un defecto universal de todas las instalaciones de Chromium 151.

El test original de Jowa era válido: verificaba la recarga, el indicador y después cobro/persistencia. Su fallo local no demostraba un defecto monetario. El resultado verde en CI con la versión compatible tampoco acreditaba el navegador alternativo local.

## Validación añadida y corrección de la ejecución

`frontend/e2e/offline-emulation.spec.ts` añade una prueba hermética del emulador con un perfil persistente. Verifica SW controlador, API disponible antes del corte, bloqueo efectivo de API sin petición al servidor durante el corte, persistencia de `navigator.onLine=false` tras recargar y reconexión. Adjunta y registra la versión y las observaciones. Si el emulador es incoherente, falla con una explicación y el comando para instalar el navegador compatible; no salta la prueba, no fuerza getters/eventos y no sustituye las respuestas de Jowa.

- **Local 151:** fallo reproducido en la aserción de coherencia, con API correctamente bloqueada. El diagnóstico se conserva en [chromium-151.json](evidencias/pr166-offline-20261015/chromium-151.json) y la [sonda sin React](evidencias/pr166-offline-20261015/sonda-sin-react.jsonl).
- **Navegador correcto para esta instalación:** ejecutar `npx playwright install chromium` y usar la selección predeterminada de Playwright, sin `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. La descarga local de 153 fue rechazada por la política del entorno: HTTP 403 `Domain forbidden` para `cdn.playwright.dev`. No se eludió la restricción. No se declara una ejecución local de 153 que no ocurrió.
- **CI:** ya ejecutó la aplicación completa con 153. La nueva sonda se incorpora a la suite normal de Chromium para comprobar por separado esa capacidad en el nuevo HEAD. Resultado definitivo y enlace de ejecución: descripción del PR #166.

No se requiere un parche del producto para imitar el comportamiento de un emulador incompatible. Las fuentes monetarias, las cuatro correcciones originales y los ajustes de POS/devoluciones permanecen intactos. Lint de la prueba y `git diff --check` sin errores.

Reproducción de la sonda (desde `frontend`, con el bundle existente):

```sh
VITE_API_URL=/api PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test e2e/offline-emulation.spec.ts
# Con el navegador que corresponde al lockfile (descarga permitida requerida):
npx playwright install chromium
VITE_API_URL=/api npx playwright test e2e/offline-emulation.spec.ts
```

## PR #165 e integración preparada

#165 sigue **abierto**, HEAD comprobado `28ffbde9`, base `main` `74ba4dcc`. Se obtuvo su lista de 86 archivos antes de editar. En esta continuación **no se modifica ninguno**, incluidos `PosContingenciaPage.tsx`, `run.sh` y `CONTEXTO_MAESTRO.md`; la instrucción actual del usuario prevalece sobre el protocolo de actualizar ese documento compartido. Esta evidencia queda en archivos ajenos a #165 y en #166.

Previsión hecha con `git merge-tree --write-tree afd14930 28ffbde9`, sin checkout, modificar archivos, mover referencias ni integrar #165: **conflicto textual en `docs/CONTEXTO_MAESTRO.md`**. Se combinan automáticamente operaciones, POS, administración de contingencia y dos archivos de pruebas POS. Es una previsión, no una validación del candidato conjunto ni autorización para fusionar #165.

Tras el merge de #165 por su responsable:

1. Volver a comprobar el estado y SHA integrado; hacer fetch de `main` y de la rama existente de #166. No crear ramas ni incorporar anticipadamente la rama abierta de #165.
2. Actualizar esa misma rama con `origin/main`; conservar ambas bitácoras y revisar los archivos combinados: cálculo en centavos/porcentaje de POS, datos del nuevo recibo y logo, prorrateo exacto de devoluciones, acumulación de caja y confirmación del cierre manual.
3. Regenerar Prisma desde el esquema integrado, sin cambiar migraciones; comprobar ascendencia de `463efae8`, `4979d8a7` y `afd14930` y los hashes monetarios previos.
4. Ejecutar frontend/backend completos, build/lint/guard, integración PostgreSQL completa y navegador real completo con Chromium compatible, incluida la sonda, los cinco casos POS, crédito, pagos parciales, devoluciones, caja y contingencia. Examinar diferencias de cantidades/importes persistidos y los checks del HEAD conjunto.
5. Publicar solo en #166. Sin merge del PR ni despliegue; mantener borrador si hay diferencias monetarias o validaciones conjuntas pendientes.

**Estado final de esta fase:** discrepancia local caracterizada como problema de emulación; sin diferencia monetaria nueva reproducida. PR #166 pendiente de integrar el `main` posterior a #165 y de validación conjunta. No se declara listo para producción.
