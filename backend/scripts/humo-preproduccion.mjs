// Humo de API contra un entorno (preproducción o, SOLO lectura, producción). No imprime contraseñas ni tokens.
// Uso (solo lectura, seguro en producción):
//   API_URL=https://servicio.onrender.com/api ADMIN_EMAIL=... ADMIN_PASSWORD=... node backend/scripts/humo-preproduccion.mjs
// Uso con escritura (SOLO preproducción/ensayo: crea un producto, abre y cierra una caja, hace una venta de contado y la entrega):
//   ... CAJERO_EMAIL=... CAJERO_PASSWORD=... SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... node backend/scripts/humo-preproduccion.mjs --escribe
// La auditoría es exclusiva del SUPERADMIN (/admin/tenants/:id/auditoria): ADMIN y CAJERO reciben 403 en /operaciones/auditoria.
// Las credenciales se leen del entorno; no se guardan. Código de salida 1 si algo falla.
// Super Admin exige SUPERADMIN_MFA_CODE (TOTP vigente o código de emergencia de un uso).
import { randomUUID } from 'node:crypto';

const API = (process.env.API_URL || '').replace(/\/$/, '');
const ESCRIBE = process.argv.includes('--escribe');
if (!API) { console.error('Defina API_URL (con /api al final).'); process.exit(2); }
if (ESCRIBE && !/^https?:\/\/(127\.0\.0\.1|localhost)\b/.test(API) && process.env.CONFIRMO_ENTORNO_NO_PRODUCTIVO !== 'SI') {
  console.error('--escribe modifica datos. Contra un servidor remoto exige CONFIRMO_ENTORNO_NO_PRODUCTIVO=SI (solo preproducción).'); process.exit(2);
}
const filas = [];
const registrar = (paso, ok, detalle = '') => { filas.push({ paso, ok, detalle }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${paso}${detalle ? ' — ' + detalle : ''}`); return ok; };
async function llamar(metodo, ruta, token, cuerpo) {
  const res = await fetch(API + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const texto = await res.text(); let json = null; try { json = texto ? JSON.parse(texto) : null; } catch { /* no JSON */ }
  return { s: res.status, b: json, cookie: res.headers.get('set-cookie') };
}
const entrar = async (email, password) => { const r = await llamar('POST', '/auth/login', null, { email, password }); return r.s === 200 ? { token: r.b.accessToken, id: r.b.user?.id, rol: r.b.user?.rol, tenantId: r.b.tenant?.id, cookie: r.cookie } : null; };
const entrarSuperAdmin = async (email, password) => { const r = await llamar('POST', '/admin/auth/login', null, { email, password, ...(process.env.SUPERADMIN_MFA_CODE ? { mfaCode: process.env.SUPERADMIN_MFA_CODE } : {}) }); return r.s === 200 ? { token: r.b.accessToken } : null; };

const salud = await llamar('GET', '/health');
registrar('El servicio responde y la base está conectada (/api/health = 200)', salud.s === 200, `HTTP ${salud.s}`);
registrar('Sin sesión se rechaza el acceso (/auth/me = 401)', (await llamar('GET', '/auth/me')).s === 401);

const admin = process.env.ADMIN_EMAIL ? await entrar(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD) : null;
registrar('Inicio de sesión del administrador', !!admin && admin.rol === 'ADMIN', admin ? `rol ${admin.rol}` : 'sin credenciales o rechazadas');
if (admin) {
  registrar('El administrador consulta productos', (await llamar('GET', '/productos', admin.token)).s === 200);
  registrar('El administrador consulta el historial de ventas', (await llamar('GET', '/ventas?limit=5', admin.token)).s === 200);
  registrar('El administrador NO accede a la auditoría (exclusiva del SUPERADMIN, 403)', (await llamar('GET', '/operaciones/auditoria?page=0', admin.token)).s === 403);
  // La contingencia offline debe seguir APAGADA hasta autorización expresa (POS_OFFLINE_ENABLED ausente). Solo lectura.
  const cfg = await llamar('GET', '/contingencia/configuracion', admin.token);
  registrar('La contingencia offline está DESACTIVADA (entorno y empresa)', cfg.s === 200 && cfg.b?.habilitada === false && cfg.b?.entornoHabilitado === false, `HTTP ${cfg.s}, habilitada=${cfg.b?.habilitada}, entornoHabilitado=${cfg.b?.entornoHabilitado}`);
}
const cajero = process.env.CAJERO_EMAIL ? await entrar(process.env.CAJERO_EMAIL, process.env.CAJERO_PASSWORD) : null;
if (process.env.CAJERO_EMAIL) registrar('Inicio de sesión del cajero', !!cajero && cajero.rol === 'CAJERO');
if (cajero) registrar('El cajero NO accede a la auditoría (403)', (await llamar('GET', '/operaciones/auditoria?page=0', cajero.token)).s === 403);
const superAdmin = process.env.SUPERADMIN_EMAIL ? await entrarSuperAdmin(process.env.SUPERADMIN_EMAIL, process.env.SUPERADMIN_PASSWORD) : null;
const auditoriaNegocio = () => llamar('GET', `/admin/tenants/${admin.tenantId}/auditoria?page=0`, superAdmin.token);
if (process.env.SUPERADMIN_EMAIL) registrar('Inicio de sesión del Super Admin', !!superAdmin);
if (superAdmin && admin) {
  const aud = await auditoriaNegocio();
  registrar('El Super Admin consulta la auditoría del negocio', aud.s === 200 && Array.isArray(aud.b), `HTTP ${aud.s}`);
}

if (ESCRIBE && admin && cajero) {
  const codigo = 'HUMO-' + randomUUID().slice(0, 8).toUpperCase();
  const prod = await llamar('POST', '/productos', admin.token, { codigo, nombre: 'Producto de humo ' + codigo, precioVenta: 100, precioCosto: 60, stockActual: 10, stockMinimo: 1 });
  if (!registrar('Alta de producto con existencias (administrador)', prod.s < 300, `HTTP ${prod.s}`)) process.exit(1);
  const abiertas = await llamar('GET', '/operaciones/caja', cajero.token);
  for (const c of (abiertas.b || []).filter((x) => x.estado === 'ABIERTA')) await llamar('POST', `/operaciones/caja/${c.id}/cerrar`, cajero.token, { monto: Number(c.efectivoEsperado) });
  const caja = await llamar('POST', '/operaciones/caja/abrir', cajero.token, { solicitudId: randomUUID(), monto: 500 });
  registrar('Apertura de caja del cajero', caja.s < 300, `HTTP ${caja.s}`);
  const sid = randomUUID();
  const venta = await llamar('POST', '/ventas', cajero.token, { solicitudId: sid, metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles: [{ productoId: prod.b.id, cantidad: 2 }] });
  registrar('Venta de contado en efectivo (cajero)', venta.s === 201, `HTTP ${venta.s}, total ${venta.b?.total}`);
  const repetida = await llamar('POST', '/ventas', cajero.token, { solicitudId: sid, metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', detalles: [{ productoId: prod.b.id, cantidad: 2 }] });
  registrar('Reintento de la misma venta no duplica (idempotencia)', repetida.s < 300 && repetida.b?.id === venta.b?.id);
  registrar('El cajero NO puede confirmar la entrega (403)', (await llamar('POST', `/operaciones/ventas/${venta.b.id}/entregar`, cajero.token, { solicitudId: randomUUID(), receptorNombre: 'Cliente' })).s === 403);
  const ent = await llamar('POST', `/operaciones/ventas/${venta.b.id}/entregar`, admin.token, { solicitudId: randomUUID(), receptorNombre: 'Cliente de humo' });
  registrar('Confirmación de entrega (administrador)', ent.s < 300, `HTTP ${ent.s}`);
  const cajas = await llamar('GET', '/operaciones/caja', cajero.token);
  const abierta = (cajas.b || []).find((x) => x.id === caja.b?.id);
  registrar('Efectivo esperado = fondo + cobro', !!abierta && Math.abs(Number(abierta.efectivoEsperado) - (500 + Number(venta.b.total))) < 0.01, `esperado ${abierta?.efectivoEsperado}`);
  registrar('Cierre de caja sin diferencia', !!abierta && (await llamar('POST', `/operaciones/caja/${abierta.id}/cerrar`, cajero.token, { monto: Number(abierta.efectivoEsperado) })).s < 300);
  const lista = await llamar('GET', '/ventas?limit=50', admin.token);
  registrar('La venta aparece en el historial del administrador', JSON.stringify(lista.b).includes(venta.b.id));
  const aud = superAdmin ? await auditoriaNegocio() : { b: null };
  registrar('La auditoría registra la venta y la entrega (consultada por el Super Admin)', Array.isArray(aud.b) && aud.b.some((f) => f.operacion === 'VENTA_CREAR') && aud.b.some((f) => f.operacion === 'VENTA_ENTREGAR'));
  if (admin.cookie) {
    const nombre = admin.cookie.split(';')[0];
    const refresco = await fetch(API + '/auth/refresh', { method: 'POST', headers: { cookie: nombre } });
    registrar('La sesión se renueva con la cookie de refresco', refresco.status < 300, `HTTP ${refresco.status}`);
  }
} else if (ESCRIBE) { registrar('Credenciales de administrador y cajero para el modo --escribe', false, 'faltan'); }

const fallos = filas.filter((f) => !f.ok).length;
console.log(`\n${filas.length - fallos} PASS / ${fallos} FAIL (modo ${ESCRIBE ? 'escritura' : 'solo lectura'})`);
process.exit(fallos ? 1 : 0);
