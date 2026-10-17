# Mediciones reproducibles — PR #171 (optimización y limpieza)

No las ejecuta CI. Requieren dependencias instaladas (`npm ci` en `frontend/` y `backend/`) y el cliente Prisma generado.

## Frontend (Chromium, backend simulado)

`pos-perf.spec.ts` (POS con 5.000 productos) e `inv-perf.spec.ts` (Inventario como ADMIN):

```bash
cd frontend && VITE_API_URL=/api npm run build
cp ../docs/evidencias/optimizacion-20261016/perf.config.ts ./perf.tmp.config.ts
PERF_DIR=../docs/evidencias/optimizacion-20261016 PERF_OUT=/tmp/pos.json npx playwright test -c perf.tmp.config.ts
rm perf.tmp.config.ts
```

Se miden los bytes JS descargados, las peticiones a la API y los milisegundos hasta el siguiente frame, con doble `requestAnimationFrame`, para escribir, agregar al carrito y teclear el cliente. `pos-antes.json` corresponde a `main` `d5fec352`. `pos-despues.json` corresponde a esta rama.

## Backend (PostgreSQL 16 temporal)

```bash
bash pg.sh /tmp/benchpg 55432          # como usuario sin privilegios
node seed.cjs postgresql://postgres@127.0.0.1:55432/postgres   # imprime el tenantId
node delay-proxy.cjs 55500 55432 3 &   # opcional: 3 ms por sentido
cd ../../../backend && npm run build
node ../docs/evidencias/optimizacion-20261016/bench.cjs "$PWD/dist" postgresql://postgres@127.0.0.1:55432/postgres <tenantId> 30
node ../docs/evidencias/optimizacion-20261016/same.cjs "$PWD/dist" postgresql://postgres@127.0.0.1:55432/postgres <tenantId>
```

`bench.cjs` mide la mediana y el p95 por llamada, el número de consultas SQL (evento `query` de Prisma) y el tamaño del JSON. `same.cjs` calcula el hash de la respuesta para compararla entre versiones. Para medir la versión anterior, compile `main` en un `git worktree` y pase su `dist`.

Resultados (mediana):

- `/productos/comercial`: 182 ms y 3 consultas → 98 ms y 2 consultas. La respuesta es idéntica: SHA-256 `128289645d9ecda9…`.
- `/dashboard` con 3 ms de latencia por sentido: 456 ms → 51 ms. Solo cambian los totales: ahora son exactos, sin residuo de coma flotante.
