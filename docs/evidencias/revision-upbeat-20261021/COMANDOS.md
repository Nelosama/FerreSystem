# Reproducción local

Entorno Node 24.19.0, Chromium del sistema 151.0.7922.173.
`PG_BIN` apunta a herramientas temporales externas al repositorio: servidor 17.10, cliente 17.11.
Nunca se utiliza una conexión externa; cada arnés crea y destruye su PostgreSQL local.

```sh
cd backend
npx prisma generate
# Validación de esquema con DATABASE_URL y DIRECT_URL sintéticas locales.
npx prisma validate
npm run build
npm run lint
npm test
npm run test:scripts
python3 scripts/validar-inventario.test.py
PG_BIN=/tmp/ferre-pg-bin REAL_SETTINGS_BROWSER=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:integration
PG_BIN=/tmp/ferre-pg-bin npm run test:e2e

cd ../frontend
npm test
VITE_API_URL=/api npm run build
npm run lint
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser -- --workers=2
# No ejecutar dos suites Playwright con el mismo outputDir a la vez.
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser -- --config playwright.session.mobile.config.ts --workers=2
PG_BIN=/tmp/ferre-pg-bin PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium E2E_WEB_PORT=4373 npm run test:e2e-real

cd ..
node backend/scripts/verificar-migraciones.mjs --base origin/main
git diff --check
```

`reportes-antes.log`: dos fallos sobre el bundle recibido para datos ausentes e inglés/CSV, dos casos de control pasan. Los tests no sustituyen el resultado final del conjunto corregido.
