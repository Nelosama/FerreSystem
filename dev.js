const { spawn } = require('child_process');
const path = require('path');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

// Determinar el comando de backend según argumentos de CLI (watch por defecto, o start)
const backendScript = process.argv.includes('--no-watch') ? 'start' : 'start:dev';

console.log('🚀 Iniciando FerreSystem (Multi-platform Node launcher)...\n');

// Iniciar Backend
const backend = spawn(npmCmd, ['run', backendScript], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'inherit',
  shell: true,
});

// Iniciar Frontend
const frontend = spawn(npmCmd, ['run', 'dev'], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit',
  shell: true,
});

function cleanup() {
  console.log('\n🛑 Deteniendo servicios...');
  if (backend) backend.kill();
  if (frontend) frontend.kill();
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
