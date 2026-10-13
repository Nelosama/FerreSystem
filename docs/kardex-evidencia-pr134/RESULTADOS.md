# Evidencia de cierre técnico — PR #134 (KARDEX)

Fecha: 2026-10-10 (UTC). Rama `claude/brave-carson-v2g7q5` sobre `claude/integracion-pos-offline-p1` (`58941e5d`). Sin merge, despliegue ni migraciones productivas.

## Reproducción de defectos (código anterior `c37438c3`, src revertido temporalmente)

| Prueba | Resultado sin corrección |
|---|---|
| P0 alta ADMIN sin precio de venta queda disponible | FALLA (reproducido) |
| P0 fijar precio cero a producto activo | FALLA (reproducido) |
| P0 venta de producto activo sin precio | FALLA (reproducido) |
| P0 HTTP alta/habilitación sin precio | FALLA (reproducido) |
| P1 HTTP BODEGUERO recibe costo, margen y costo vigente | FALLA (reproducido) |
| P1 HTTP vista previa de levantamiento a BODEGUERO con costos | FALLA (reproducido) |
| SEC-005 BODEGUERO con permiso de inventario | FALLA (se actualizó a la regla) |

Total: 7 fallos sobre código anterior; con la corrección, todas pasan.

## Resultados con la corrección

| Suite | Resultado |
|---|---|
| Backend build (`tsc -p tsconfig.build.json`) | sin errores |
| Backend lint | sin errores |
| Backend unitarias | 345/345 |
| Backend integración PostgreSQL 16 (usuario no root) | 392 pasan, 1 omitida (preexistente), de 393 |
| Frontend `tsc -b` | sin errores |
| Frontend lint | sin errores |
| Frontend unitarias | 224/224 |
| Frontend build (`VITE_API_URL=/api`, local) | compila |
| Playwright e2e (Chromium preinstalado) | 119/119; incluye la nueva prueba P2 de levantamiento |

## Diagnóstico de costos (solo lectura)

Prueba `inventario-ciclo`: clasifica `COSTO_VIGENTE_COINCIDE_CON_ULTIMA_COMPRA` y `SIN_COSTO_VIGENTE`, no incluye productos coherentes, y una escritura dentro de la transacción de solo lectura falla. Los datos quedan intactos.

## Notas

- Playwright regenera `frontend/artifacts/*.png`; se restauran del repositorio antes de confirmar.
- Las pruebas de integración usan clúster PostgreSQL desechable; no se usó ninguna `DATABASE_URL` real.
