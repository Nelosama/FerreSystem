# Reproducir QA-INV-001 a QA-INV-004

## Base verificada

Código auditado: `b314ef0ecf2820c57b525d157918413b2972544f`.

Se repitieron las pruebas en un worktree detached con HEAD exactamente en ese SHA, copiando únicamente los dos archivos de reproducción. Resultado: PostgreSQL 17.11 **4/4** y Chromium **1/1**; bundle construido desde ese checkout. Ningún archivo de producción rastreado fue modificado. Se reutilizaron dependencias locales mediante enlaces, sin cambiar manifiestos ni lockfiles. Logs: `qa-verificacion-base-postgres.log`, `qa-verificacion-base-build.log`, `qa-verificacion-base-ux.log`.

Las pruebas **afirman el defecto observado**. Deben pasar sobre la base auditada; después de corregir esos comportamientos deberán reemplazarse sus aserciones por las del contrato correcto. No cuentan como pruebas de aceptación de una corrección.

## Preparación

```bash
git clone https://github.com/Nelosama/FerreSystem.git
cd FerreSystem
git switch audit/inventario-independent-20261010
cd backend
npm ci
npx prisma generate
export PG_BIN=/ruta/a/postgresql/bin
```

Requisitos: Node 24, PostgreSQL real con `initdb`, `pg_ctl` y `psql`. Ejecutar como usuario no root. El arnés crea un clúster temporal exclusivo en loopback y no usa una URL externa de base de datos. En la verificación se utilizó `/workspace/qa-tools/pg-deb/usr/lib/postgresql/17/bin`.

## PostgreSQL: comandos individuales (desde backend)

```bash
# QA-INV-001A: formulario de precio abierto antes de aplicar levantamiento
npx vitest run --config vitest.config.integration.ts test/auditoria-inventario.postgres.integration.ts -t 'QA-INV-001:'

# QA-INV-001B: formulario de costo abierto antes de recibir compra
npx vitest run --config vitest.config.integration.ts test/auditoria-inventario.postgres.integration.ts -t 'QA-INV-001B:'

# QA-INV-002: conciliación obsoleta
npx vitest run --config vitest.config.integration.ts test/auditoria-inventario.postgres.integration.ts -t 'QA-INV-002:'

# QA-INV-003: conflicto por identidad mixta
npx vitest run --config vitest.config.integration.ts test/auditoria-inventario.postgres.integration.ts -t 'QA-INV-003:'

# Ejecutar los cuatro casos juntos
npx vitest run --config vitest.config.integration.ts test/auditoria-inventario.postgres.integration.ts
```

| Caso | Resultado esperado de la reproducción sobre b314ef0e | Comportamiento que debería tener la corrección |
|---|---|---|
| QA-INV-001A | 1 prueba aprobada: aplicar cambia precio 4→9 sin cambiar versión 1; PUT antiguo responde 200 y deja precio 5 | Rechazar versión antigua con 409 |
| QA-INV-001B | 1 prueba aprobada: recepción a costo 6 deja versión 1; PUT antiguo responde 200 y deja precioCosto=3, costoVigente=6 y stock=13 | Detectar formulario obsoleto; definir consistencia de costos sin cambiar permiso manual por esta auditoría |
| QA-INV-002 | 1 prueba aprobada: ADMIN vio 3/4; BODEGUERO corrigió 4→12; conciliar responde 201, elimina 12 y permite aplicar stock 3 | Rechazar conciliación obsoleta con 409 antes de eliminar o aplicar |
| QA-INV-003 | 1 prueba aprobada: dos grupos individuales; editar cantidad limpia ambos conflictos; conciliar responde 404; preview sigue bloqueado por duplicado | Mantener un conflicto común y conciliable |

Los comandos individuales filtran un caso y omiten los otros tres; la ejecución conjunta debe mostrar **4 passed**. No se modifica código de producción para producir los errores.

## Chromium: QA-INV-004 (desde frontend)

Desde `backend`, ejecutar `cd ../frontend` y después:

```bash
npm ci
VITE_API_URL=https://api.example.test/api npm run build
npx playwright install chromium
npx playwright test e2e/auditoria-inventario.spec.ts --workers=1 --grep 'QA-INV-004:'
```

**Resultado esperado:** `1 passed`; la columna Usuario muestra `ce4833d4-b09c-4eb3-a233-271a10211640` en vez del nombre del empleado. Genera `test-results/qa-conflictos-uuid.png`. La evidencia visual de la auditoría también está guardada en esta carpeta.

Esta prueba renderiza el bundle real con API simulada. Acredita la presentación del UUID; no acredita persistencia. El backend real devuelve `contadorId` en el flujo auditado. La corrección debería resolver y mostrar el nombre dentro del tenant.

## Informe y alcance

Informe: `docs/AUDITORIA_INVENTARIO_INDEPENDIENTE_20261010.md`.

Publicación de rama autorizada por el usuario. Solo pruebas y documentación/evidencia; sin cambios de producción, sin merge ni comandos de despliegue. Las correcciones las implementará Claude; su validación independiente posterior queda pendiente.
