# Entrega a ATLAS y FARO — escenarios de cierre de sesión con IndexedDB

**De:** CENTINELA. **Para:** ATLAS (implementación de sincronización offline, PR #129) y FARO (QA y evidencia). **Estado:** entregado por documento. **No había agentes activos en esta sesión**: transmitir por el canal habitual.

## 1. Reparto propuesto

| Responsable | Qué hace | Qué no hace |
|---|---|---|
| **ATLAS** | Implementa E1–E9 en `frontend/e2e-real/` sobre la API real. Confirma que la regla `puedeEnviar` (E5) es la decisión de producto vigente. Verifica que no hay trabajo en curso sobre `sync.ts`, `db.ts` ni `TenantContext.tsx` | No decide la propiedad de la cola (E5) por sí mismo |
| **FARO** | Revisa la matriz y la evidencia de ejecución: trazas de IndexedDB, consultas de PostgreSQL y capturas. No aprueba ningún escenario sin esa evidencia | No implementa los tests |
| **CENTINELA** | Revisa solo las afirmaciones de seguridad de cada escenario (sesión revocada, no sobrescribir, idempotencia). No modifica el código de sincronización | No implementa ni ejecuta los escenarios |

## 2. Documento de referencia

`docs/agentes/ESCENARIOS_CIERRE_SESION_INDEXEDDB.md`: contrato verificado en el código, escenarios E1–E9, requisitos técnicos y criterio de cierre.

## 3. Decisión pendiente antes de cerrar E5

Si el cajero que creó una venta no vuelve a iniciar sesión en ese equipo, la venta queda bloqueada hasta que lo haga un ADMIN. **Es una decisión de producto.** Opciones: que un ADMIN envíe en nombre del cajero, o que la interfaz ofrezca transferir la cola. Responsable: dueño del producto, con ATLAS.

Además, no hay confirmación de qué muestra la interfaz en ese caso: ningún componente revisado usa `sinSesion`.

## 4. Criterio de cierre (compartido)

Un escenario se considera cerrado cuando: a) existe el test en `frontend/e2e-real/` y pasa sobre la API real; b) hay evidencia de IndexedDB y de PostgreSQL; c) FARO lo aprueba; d) E5 tiene decisión de producto registrada.

**Ningún escenario está aprobado hoy.** Ninguno está implementado.
