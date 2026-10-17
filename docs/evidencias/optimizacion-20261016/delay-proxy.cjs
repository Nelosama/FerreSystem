// Proxy TCP con retardo fijo por sentido para simular la latencia de red API↔base (Render↔Supabase).
const net = require('net'); const [, , listen, target, ms] = process.argv;
net.createServer(c => { const s = net.connect(Number(target), '127.0.0.1');
  const pipe = (a, b) => a.on('data', d => setTimeout(() => b.write(d), Number(ms))).on('close', () => b.destroy()).on('error', () => b.destroy());
  pipe(c, s); pipe(s, c); }).listen(Number(listen), '127.0.0.1');
