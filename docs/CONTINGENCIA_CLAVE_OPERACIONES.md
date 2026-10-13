# CONTINGENCIA_CLAVE_OPERACIONES — configuración por entorno

Estado: preparado para local, CI y despliegue. **Este documento y el código no contienen ningún valor real.** Ningún agente genera ni provisiona claves de entornos reales; lo hace el responsable de cada entorno con autorización independiente.

## Qué es y por qué existe

El servidor emite los identificadores de las operaciones del POS offline (H-5, opción A): cada ventana trae hasta 500 UUID derivados con HMAC-SHA256 de `ventanaId:indice`. La clave de esa derivación es **dedicada**: no es `JWT_SECRET`, así que rotar la sesión no invalida las ventanas emitidas (F4). Nunca sale del backend.

## Variables

| Variable | Obligatoria | Regla |
|---|---|---|
| `CONTINGENCIA_CLAVE_OPERACIONES` | **Sí, siempre** (el backend no arranca sin ella) | Al menos 32 caracteres; distinta de `JWT_SECRET`; **independiente y no reutilizada** entre desarrollo, pruebas y producción; persistente (se conserva entre reinicios y despliegues) |
| `CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR` | Solo durante una transición | Al menos 32 caracteres; distinta de la actual. **Solo verifica** ventanas ya emitidas; nunca emite. Puede ser el valor de `JWT_SECRET` con el que se derivaron las ventanas anteriores a F4 |

Validación de arranque (`backend/src/contingencia/clave-operaciones.ts`, invocada en `main.ts` antes de crear la aplicación): si falta o es inválida, el proceso termina con código 1 y un mensaje de una línea (`[ARRANQUE] CONTINGENCIA_CLAVE_OPERACIONES es obligatoria y debe tener al menos 32 caracteres. Consulte docs/CONTINGENCIA_CLAVE_OPERACIONES.md`). **Ningún mensaje incluye el valor de una clave**; hay pruebas para ello (`backend/test/contingencia-clave-config.postgres.integration.ts` y `backend/scripts/arranque-clave.test.mjs`, que arranca el backend compilado).

## Cómo se inyecta

| Entorno | Mecanismo | Quién la define |
|---|---|---|
| Desarrollo (máquina de cada persona) | `backend/.env` a partir de `backend/.env.example` (el archivo real está ignorado por Git) | cada desarrollador, valor propio |
| Pruebas de integración | `backend/vitest.config.integration.ts` fija un valor **no productivo** | repositorio (valor de prueba) |
| `e2e-real` | `frontend/e2e-real/run.sh` genera un valor aleatorio por ejecución | el script |
| CI (`.github/workflows/operacion-ferreteria.yml`) | paso «Clave efímera de la contingencia»: valor aleatorio por ejecución, enmascarado en el registro | el flujo |
| Instalación local con Docker (`deploy/local`) | secreto de Docker `contingencia_clave_operaciones` (archivo `secrets/contingencia_clave_operaciones`, permisos 0600). `container-entry.mjs` lo lee de `/run/secrets` y lo expone al proceso | `prepare.mjs` en instalaciones nuevas; `agregar-clave-contingencia.mjs` en las existentes |
| Otros despliegues (Render, etc.) | variable de entorno del servicio o gestor de secretos de la plataforma | el responsable del entorno, valor propio |

### Instalación local nueva
`node deploy/local/prepare.mjs …` ya crea el secreto junto con los demás (valor aleatorio propio de esa instalación, no se imprime).

### Instalación local existente (actualización)
Antes de arrancar la versión que exige la clave, el responsable de esa instalación ejecuta una vez:

```sh
node deploy/local/agregar-clave-contingencia.mjs /ruta/privada/ferresystem
```

Crea `secrets/contingencia_clave_operaciones` (0600) sin imprimirla y **no sobrescribe** una existente. Sin este paso, `docker compose` falla porque el secreto declarado no existe.

### Otros entornos
Generar un valor aleatorio de al menos 32 caracteres con el gestor de secretos o, por ejemplo, `openssl rand -base64 48` (no guardarlo en el historial de la terminal compartida ni en el repositorio), definirlo **solo** en ese entorno y registrar quién y cuándo lo definió, **sin** anotar el valor.

## Transición con operaciones offline pendientes

Las ventanas duran como máximo 36 horas. Si existen ventanas emitidas con otra clave (por ejemplo derivadas de `JWT_SECRET` antes de F4, o antes de rotar esta clave):

1. Definir la nueva `CONTINGENCIA_CLAVE_OPERACIONES`.
2. Definir `CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR` con la clave con la que se derivaron esas ventanas (en Docker local: archivo `secrets/contingencia_clave_operaciones_anterior` y declararlo como secreto adicional en `compose.yaml`; `container-entry.mjs` ya lo lee si existe).
3. Desplegar. Las operaciones pendientes de ventanas antiguas se siguen aceptando (solo verificación); las ventanas nuevas se emiten con la clave nueva. Prueba: `backend/test/contingencia-identidad.postgres.integration.ts` (transición).
4. Cuando no queden operaciones pendientes de ventanas anteriores (ninguna ventana con más de 36 horas y panel de contingencia sin pendientes), **retirar** `…_ANTERIOR` y volver a desplegar.

**No rotar la clave actual sin este procedimiento**: las operaciones offline pendientes de las ventanas ya emitidas se rechazarían como `OPERACION_NO_EMITIDA` (se conservan en el equipo y se pueden reenviar con una ventana nueva, pero conviene evitarlo).

## Qué no hacer
- No reutilizar la clave de un entorno en otro, ni usar `JWT_SECRET` (el arranque lo rechaza).
- No escribirla en el repositorio, en `docker-compose` con valor literal, en registros, en tickets ni en el chat.
- No generarla ni cambiarla en producción sin autorización del responsable del entorno.

## Estado de aprobación
La provisión en cada entorno real está **pendiente** de su responsable; este cambio solo deja la configuración preparada y verificada con valores de prueba.
