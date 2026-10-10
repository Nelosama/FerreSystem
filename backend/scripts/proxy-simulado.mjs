#!/usr/bin/env node
// CENTINELA — proxy de verificación local: un salto que añade la IP real al final de X-Forwarded-For
// (mismo comportamiento que nginx con $proxy_add_x_forwarded_for). Solo para validar TRUST_PROXY en local.
// Uso: node scripts/proxy-simulado.mjs --puerto 3200 --destino http://127.0.0.1:3100
import http from 'node:http';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const puerto = Number(args.get('puerto') ?? 3200);
const destino = new URL(args.get('destino') ?? 'http://127.0.0.1:3100');

http.createServer((peticion, respuesta) => {
  const previo = peticion.headers['x-forwarded-for'];
  const ipReal = peticion.socket.remoteAddress ?? 'desconocida';
  const cabeceras = { ...peticion.headers, 'x-forwarded-for': previo ? `${previo}, ${ipReal}` : ipReal };
  const salida = http.request({ hostname: destino.hostname, port: destino.port, path: peticion.url, method: peticion.method, headers: cabeceras }, (res) => {
    respuesta.writeHead(res.statusCode ?? 502, res.headers);
    res.pipe(respuesta);
  });
  salida.on('error', () => { respuesta.writeHead(502); respuesta.end('proxy: destino no disponible'); });
  peticion.pipe(salida);
}).listen(puerto, '127.0.0.1', () => console.log(`proxy-simulado en 127.0.0.1:${puerto} -> ${destino.origin}`));
