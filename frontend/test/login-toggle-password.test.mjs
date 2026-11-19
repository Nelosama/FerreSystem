import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('traducciones: existen las claves para mostrar y ocultar contraseña en español e inglés', () => {
  const es = JSON.parse(read('src/locales/es.json'));
  const en = JSON.parse(read('src/locales/en.json'));

  assert.equal(es.shell?.login?.show_password, 'Mostrar contraseña');
  assert.equal(es.shell?.login?.hide_password, 'Ocultar contraseña');

  assert.equal(en.shell?.login?.show_password, 'Show password');
  assert.equal(en.shell?.login?.hide_password, 'Hide password');
});

test('LoginPage: implementa el botón de mostrar/ocultar contraseña con accesibilidad y seguridad', () => {
  const codigo = read('src/pages/LoginPage.tsx');

  // Importación de iconos Eye y EyeOff de lucide-react
  assert.match(codigo, /import\s*\{[^}]*\bEye\b[^}]*\bEyeOff\b[^}]*\}\s*from\s*['"]lucide-react['"]/);

  // Estado inicial oculto por defecto (false)
  assert.match(codigo, /const\s*\[mostrarPassword,\s*setMostrarPassword\]\s*=\s*useState\(false\)/);

  // El campo alterna dinámicamente entre 'text' y 'password' según mostrarPassword
  assert.match(codigo, /type=\{mostrarPassword\s*\?\s*['"]text['"]\s*:\s*['"]password['"]\}/);

  // El botón tiene type="button" explícito para no enviar el formulario
  assert.match(codigo, /<button[^>]*type=["']button["'][^>]*class(Name)?=["'][^"']*login-campo-toggle/);

  // Accesibilidad: etiqueta accesible en español mediante i18n y aria-controls
  assert.match(codigo, /aria-label=\{mostrarPassword\s*\?\s*t\(['"]shell\.login\.hide_password['"]\)\s*:\s*t\(['"]shell\.login\.show_password['"]\)\}/);
  assert.match(codigo, /aria-controls=["']login-clave["']/);

  // Alternancia del icono entre Eye (cuando está oculta) y EyeOff (cuando está visible)
  assert.match(codigo, /mostrarPassword\s*\?\s*\(\s*<EyeOff/);
  assert.match(codigo, /:\s*\(\s*<Eye/);
});

test('App.css: estilos del campo de contraseña y botón toggle', () => {
  const css = read('src/App.css');

  // Regla para el icono toggle a la derecha
  assert.match(css, /\.login-campo-toggle\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.login-campo-toggle\s*\{[^}]*right:\s*4px/);

  // Regla para que el input tenga espacio a la derecha y el texto no quede debajo del botón
  assert.match(css, /\.login-campo--password\s+\.form-input\s*\{[^}]*padding-right:\s*44px/);

  // Icono izquierdo no interfiere con el botón toggle
  assert.match(css, /\.login-campo\s*>\s*svg/);
});

