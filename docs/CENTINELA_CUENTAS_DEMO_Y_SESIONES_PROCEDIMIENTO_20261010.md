# CENTINELA — auditoría, rotación e invalidación de sesiones de cuentas demo (2026-10-10)

**Firma:** CENTINELA. **Estado:** procedimiento. **No se ha ejecutado nada sobre producción** ni sobre ningún entorno real. Ningún paso de este documento se ejecuta sin autorización escrita del propietario.

## 0. Condiciones previas (obligatorias)

1. **Autorización escrita** del propietario con: entorno exacto, ventana, responsable que ejecuta y ticket. Sin ella, no se avanza de la fase 1.
2. **Copia restaurada, no producción.** La auditoría se hace sobre una restauración aislada del respaldo (procedimiento de NEXUS, `docs/agentes/ENTREGA_NEXUS_DERIVA_Y_MIGRACIONES_20261010.md`).
3. **Ninguna contraseña en el chat, en el repositorio ni en logs.** Las contraseñas nuevas se generan y se entregan fuera de banda al responsable.
4. Anotar en el ticket la hora de inicio y de fin de cada fase.

## 1. Fase 1 — auditoría (solo lectura)

Script: `backend/scripts/auditar-claves-demo.mjs`. Ejecuta `SET TRANSACTION READ ONLY`, compara los hashes con las dos claves públicas históricas, y **no imprime hashes ni contraseñas**. Solo imprime tipo, identificador y correo de cada coincidencia.

```
cd backend
DATABASE_URL="<URL de la copia restaurada>" node scripts/auditar-claves-demo.mjs
```

Códigos de salida: `0` sin coincidencias; `2` hay cuentas con clave demo; `1` error. **No usar `DATABASE_URL` de producción en esta fase.**

Si hay coincidencias: pasar a la fase 3 solo con autorización. Si no hay: el resultado vale para la copia, no prueba nada sobre producción. Repetir la fase sobre producción solo con autorización explícita y en modo lectura.

## 2. Fase 2 — revisión de accesos (solo lectura)

Consultas sobre la copia. Solo cuentan y agrupan; no devuelven datos sensibles.

```sql
-- Sesiones vigentes por tipo de cuenta
SELECT tipo, COUNT(*) FROM sesiones_auth
WHERE revoked_at IS NULL AND expires_at > now()
GROUP BY tipo;

-- Sesiones vigentes de usuarios (tenant) de cuentas demo identificadas en fase 1
SELECT s.tenant_id, COUNT(*) FROM sesiones_auth s
WHERE s.revoked_at IS NULL AND s.expires_at > now() AND s.sujeto_id = ANY($1::text[])
GROUP BY s.tenant_id;

-- Bloqueos de inicio de sesión activos (sin claves ni correos)
SELECT COUNT(*) FILTER (WHERE bloqueado_hasta > now()) AS bloqueadas,
       COUNT(*) FILTER (WHERE fallos > 0) AS con_fallos
FROM intentos_login;
```

`intentos_login.clave` es un hash de la cuenta o IP: **no lo consultar ni exportarlo**.

Revisar además la auditoría de la aplicación (`auditoria_operaciones`) por inicios de sesión de cuentas demo, si existe el evento, solo en número de eventos.

## 3. Fase 3 — rotación de contraseñas (requiere autorización)

**Preferir la vía de la aplicación** en lugar de SQL directo: ambas rutas revocan las sesiones automáticamente.

- Cuenta de tenant: cambio de contraseña en el módulo de usuarios. `backend/src/usuarios/usuarios.service.ts:42` llama a `revocarSesionesDeSujeto(..., 'CAMBIO_CONTRASEÑA')`.
- Super Admin: `backend/src/super-admin/super-admin.service.ts:305` revoca al cambiar la contraseña (motivo `CAMBIO_CONTRASEÑA`).

Verificación tras la rotación, sobre la copia:
1. Inicio de sesión con la clave histórica → **401**.
2. Inicio de sesión con la nueva clave → 200 (solo en la copia; en producción, comprobarlo con la cuenta del responsable).
3. Ejecutar de nuevo `auditar-claves-demo.mjs` → **código 0**.

Si la vía de la aplicación no está disponible, el SQL manual exige que el responsable genere el hash **con la misma función bcrypt del backend**, fuera del repositorio, y que se revoquen las sesiones en el mismo paso (fase 4). Un cambio de hash sin revocar sesiones deja las sesiones vivas hasta su vencimiento.

## 4. Fase 4 — invalidación de sesiones

Cuando hay sospecha de uso de una clave, aunque no haya cambio de contraseña: revocar las sesiones vigentes del sujeto. Columnas reales del modelo (`backend/prisma/schema.prisma`, `SesionAuth`): `sujeto_id`, `revoked_at`, `revocation_motivo`.

```sql
UPDATE sesiones_auth
SET revoked_at = now(), revocation_motivo = 'INVALIDACION_CENTINELA'
WHERE sujeto_id = $1 AND revoked_at IS NULL;
```

Este UPDATE **solo se ejecuta con autorización**, sobre el entorno autorizado, y en una transacción con el número de filas esperado impreso antes del COMMIT. Revocar sesiones de un sujeto no altera datos de negocio. La revocación es irreversible para esa sesión, pero el usuario puede iniciar sesión de nuevo.

Los access tokens ya emitidos dejan de valer en la siguiente petición, porque cada petición revalida la sesión (`backend/src/auth/jwt.strategy.ts`).

## 5. Fase 5 — evidencia y cierre

Registrar en el ticket, sin secretos:
- Entorno, copia (fecha de respaldo), versión del repositorio (SHA).
- Código de salida de `auditar-claves-demo.mjs` antes y después.
- Número de sesiones revocadas por motivo.
- Número de cuentas rotadas (sin nombres de cuenta ni correos si el ticket es externo).
- Confirmación de que nadie conserva la clave histórica en el repositorio, los logs o el chat.

**Pendiente de acción del propietario:** confirmar si la clave `SuperAdmin2026!` o `Ferre2026!` estuvo activa en algún entorno real. Hasta que lo confirme, se considera comprometida.

## 6. Límites

- CENTINELA no tiene acceso a producción. No ejecuta ninguna fase sobre producción.
- No existe script de rotación en el repositorio. Crearlo queda pendiente de decisión del propietario.
- Las claves históricas son públicas por estar en el historial de git. No se usan como secreto en ningún lugar.

*Firmado: CENTINELA.*
