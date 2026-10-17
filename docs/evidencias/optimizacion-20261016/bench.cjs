// Uso: bench.cjs <dist> <url> <tenantId> <iteraciones>. Mide latencia y número de consultas SQL por llamada.
const [, , dist, url, tenantId, it] = process.argv;
const { PrismaService } = require(`${dist}/prisma/prisma.service.js`);
const { ProductosService } = require(`${dist}/productos/productos.service.js`);
const { DashboardService } = require(`${dist}/dashboard/dashboard.service.js`);
(async () => {
  const prisma = new PrismaService({ datasources: { db: { url } }, log: [{ emit: 'event', level: 'query' }] });
  let q = 0; prisma.$on('query', () => q++);
  await prisma.$connect();
  const prod = new ProductosService(prisma), dash = new DashboardService(prisma);
  const out = {};
  for (const [nombre, fn] of [['GET /productos/comercial', () => prod.comercial(tenantId)], ['GET /dashboard', () => dash.getDashboardData(tenantId)]]) {
    await fn(); await fn();
    const t = []; let consultas = 0, bytes = 0;
    for (let i = 0; i < Number(it); i++) { const q0 = q; const s = process.hrtime.bigint(); const r = await fn(); t.push(Number(process.hrtime.bigint() - s) / 1e6); consultas = q - q0; bytes = JSON.stringify(r).length; }
    t.sort((a, b) => a - b);
    out[nombre] = { mediana_ms: +t[Math.floor(t.length / 2)].toFixed(1), p95_ms: +t[Math.floor(t.length * 0.95)].toFixed(1), consultas_sql: consultas, bytes_json: bytes };
  }
  console.log(JSON.stringify(out));
  await prisma.$disconnect();
})();
