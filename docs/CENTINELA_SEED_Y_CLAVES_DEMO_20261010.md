# CENTINELA — seed, claves demo y cuentas existentes (2026-10-10)

## 1. Pregunta

¿Puede alguna cuenta existente conservar una contraseña de demostración conocida como efecto del seed?

## 2. Respuesta corta

- **El seed actual no puede dejar ni poner una clave demo.** Las claves solo se escriben al **crear** una cuenta, y vienen de variables de entorno sin valor por defecto. Una cuenta existente nunca recibe una clave nueva desde el seed (verificado, §4).
- **Sí pueden existir cuentas con clave demo** si el seed histórico (merge #64 y anteriores) se ejecutó contra una base. Ese seed reescribía la clave en cada ejecución. **No he podido verificar producción.** El seed nuevo tampoco corrige esas cuentas, así que la verificación y la rotación dependen del responsable.

## 3. Qué cambió en el seed

| Antes | Ahora |
|---|---|
| Super Admin: clave fija, reescrita en cada ejecución | Clave de `SUPER_ADMIN_PASSWORD` solo al crear; existentes intactas |
| Admin de La Mundial: clave fija, reescrita en cada ejecución | Clave de `TENANT_ADMIN_PASSWORD` solo al crear; existentes intactas |
| Protección: host local o `SEED_CONFIRMAR_HOST` | Marca de entorno **en la base** (`entorno_ferresystem`, tipo DESARROLLO o STAGING), con identificador en `prisma/entornos-seed.json` y confirmación de ese identificador exacto |
| Claves impresas al final | Solo correos |

El host no es criterio: un túnel o un alias pueden apuntar un nombre local a producción. La marca la crea el responsable a mano, con `prisma/entorno/entorno-marcador.sql`, fuera de `migrations/`. El CI rechaza que una migración cree esa tabla.

## 4. Verificación realizada (solo base temporal, sin datos reales)

Script: ejecución en un clúster PostgreSQL 16 desechable con todas las migraciones.

| # | Escenario | Resultado |
|---|---|---|
| 1 | Seed histórico (de `main`) sobre base vacía | Crea Super Admin y admin de empresa con claves demo |
| 1b | Auditoría de solo lectura sobre ese estado | **Detecta 2 cuentas con clave demo** (código 2) |
| 2 | Seed nuevo sin marca | Rechazado: «no se pudo leer la marca» |
| 3 | Marca `PRODUCCION` | Rechazado: «solo siembra DESARROLLO o STAGING» |
| 4 | Marca válida, identificador no aprobado | Rechazado: «no está en prisma/entornos-seed.json» |
| 5 | Identificador aprobado, sin confirmación | Rechazado: pide `SEED_CONFIRMAR_IDENTIFICADOR` exacto |
| 6 | Confirmación exacta sobre cuentas existentes | Seed correcto. **Hash de todas las cuentas idéntico antes y después** |
| 6b | Auditoría tras el seed nuevo | Sigue detectando 2 cuentas demo (correcto: el seed no corrige, y debe rotarse) |
| 7 | Base vacía con marca aprobada | Siembra correcta; **auditoría limpia (0)** |

Pruebas unitarias del guard y del auditor: `backend/scripts/guard-seed.test.mjs` (7) y `auditar-claves-demo.test.mjs` (2). Suite de scripts: 33/33.

## 5. Lo que NO se ha verificado

- **Producción y staging reales.** No hay acceso de lectura autorizado desde esta sesión. Ninguna consulta se ejecutó contra ninguna base real.
- **Historial de ejecución del seed en cada entorno.** No hay registro en el repositorio de cuándo se ejecutó ni contra qué base.

## 6. Procedimiento para el responsable (requiere autorización)

1. **Auditoría de solo lectura** en cada base con cuentas reales:
   ```sh
   DATABASE_URL=<url de solo lectura> node backend/scripts/auditar-claves-demo.mjs
   ```
   El script usa `SET TRANSACTION READ ONLY`, no imprime hashes y devuelve 2 si encuentra coincidencias. No escribe nada.
2. **Si hay coincidencias:** rotar las claves de esas cuentas desde la administración (reset de Super Admin o de administrador de empresa). Después, repetir la auditoría hasta obtener 0.
3. **Si la base tiene las empresas de demostración** (`LA MUNDIAL - SUCURSAL CENTRO`, correos `*@lamundial.hn`, `*@constructoranorte.hn`): decidir con el dueño si se retiran. No se borran en esta fase.
4. **Registrar cada base de desarrollo o staging:** ejecutar `entorno-marcador.sql` una vez, copiar el identificador a `prisma/entornos-seed.json` mediante PR revisado por CODEOWNERS.

## 7. Límites

- La auditoría compara hashes con dos claves conocidas. Una cuenta con otra clave débil no se detecta. Recomendación: ampliar la lista con claves que hayan aparecido en documentación o en conversaciones.
- `replace-super-admin.ts` (operación del dueño) elimina Super Admins por diseño y no usa la marca de entorno, porque se ejecuta contra producción con confirmación explícita. Queda documentado en el informe de controles.
