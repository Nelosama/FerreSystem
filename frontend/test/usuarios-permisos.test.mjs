import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// JW-09: la pantalla de Usuarios solo ofrece permisos que el servidor aplica. «pos.anular_venta» no existe en el
// backend (una venta se revierte con una devolución, directa solo ADMIN): ofrecerlo daba una falsa sensación de control.
// La comprobación de servidor está en backend/test/ciclo-ventas.postgres.integration.ts («JW-09»).
const src = fs.readFileSync(fs.existsSync('src/pages/UsuariosPage.tsx') ? 'src/pages/UsuariosPage.tsx' : 'frontend/src/pages/UsuariosPage.tsx', 'utf8');

test('JW-09: la lista de permisos asignables no incluye pos.anular_venta', () => {
  // La lista asignable es PERMISOS_BASE (+ PERMISOS_CONTABILIDAD solo con el módulo contratado); se revisan ambas.
  const bloque = (nombre) => src.slice(src.indexOf(`const ${nombre}`), src.indexOf('];', src.indexOf(`const ${nombre}`)));
  const lista = bloque('PERMISOS_BASE') + bloque('PERMISOS_CONTABILIDAD');
  assert.ok(lista.length > 0);
  assert.doesNotMatch(lista, /clave: 'pos\.anular_venta'/);
  assert.match(lista, /clave: 'pos\.vender'/);
});

test('JW-09: los permisos por defecto de ADMIN no incluyen pos.anular_venta', () => {
  const admin = src.slice(src.indexOf('ADMIN: {'), src.indexOf('CAJERO: {'));
  assert.doesNotMatch(admin, /'pos\.anular_venta'/);
});
