const { spawn } = require('child_process');
const path = require('path');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

console.log('🚀 Iniciando FerreSystem en modo desarrollo (Multi-platform Node launcher)...\n');

// Iniciar Backend
const backend = spawn(npmCmd, ['run', 'start:dev'], {
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
