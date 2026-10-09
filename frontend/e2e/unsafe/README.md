# e2e/unsafe — Scripts de siembra manual

> **⚠️ ESTOS ARCHIVOS NUNCA SE EJECUTAN EN CI NI CONTRA PRODUCCIÓN**

Los archivos en esta carpeta son scripts de siembra de datos de demostración para uso **exclusivamente manual** por el administrador del sistema en un entorno de pruebas aislado.

## Reglas

1. **Nunca** ejecutar contra `ferre-system.vercel.app` ni ningún entorno con datos reales del cliente.
2. **Siempre** requerir la variable de entorno `SEED_TARGET_URL` apuntando a un servidor local/staging.
3. **Nunca** incluir credenciales reales. Usar variables de entorno.
4. El script leerá credenciales de `SEED_EMAIL` y `SEED_PASSWORD` — nunca valores en código.
5. CI ignora esta carpeta mediante `testIgnore` en `playwright.config.ts`.

## Uso correcto

```powershell
# Solo en entorno local de pruebas aislado
$env:SEED_TARGET_URL = 'http://localhost:4173'
$env:SEED_EMAIL      = 'admin@test.local'
$env:SEED_PASSWORD   = 'contraseña-de-prueba-local'
npx playwright test e2e/unsafe/seed-alex.spec.ts --project=chromium
```

## Lo que NO debes hacer

```powershell
# ❌ NUNCA — apunta a producción
npx playwright test e2e/unsafe/seed-alex.spec.ts
```
