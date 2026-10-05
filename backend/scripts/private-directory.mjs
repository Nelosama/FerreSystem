import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

// Resuelve también destinos todavía inexistentes a través de su ancestro real.
// Un enlace roto no se trata como un directorio pendiente de crear.
export function resolvePrivateDirectory(directory, projectDirectory) {
  const project = realpathSync(resolve(projectDirectory));
  let ancestor = resolve(directory);
  const missing = [];

  for (;;) {
    let exists = true;
    try {
      lstatSync(ancestor);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      exists = false;
    }
    if (exists) break;
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error('No se pudo resolver el directorio privado.');
    missing.unshift(basename(ancestor));
    ancestor = parent;
  }

  const root = resolve(realpathSync(ancestor), ...missing);
  const location = relative(project, root);
  if (location === '' || (location !== '..' && !location.startsWith(`..${sep}`) && !isAbsolute(location))) {
    throw new Error('El directorio privado debe estar fuera del repositorio.');
  }
  return root;
}
