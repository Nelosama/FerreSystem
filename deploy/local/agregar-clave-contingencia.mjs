// Para instalaciones locales EXISTENTES: crea el secreto `contingencia_clave_operaciones` que el backend exige al arrancar.
// Uso: node deploy/local/agregar-clave-contingencia.mjs DIRECTORIO_PRIVADO   (el mismo que se pasó a prepare.mjs)
// Genera un valor aleatorio propio de ESTA instalación (nunca se reutiliza entre entornos), lo guarda con permisos 0600 y NO lo imprime.
// No sobrescribe un secreto existente. No interviene en producción: cada entorno ejecuta esto por su cuenta, con autorización del responsable.
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolvePrivateDirectory } from '../../backend/scripts/private-directory.mjs';
const [target]=process.argv.slice(2);
if(!target)throw new Error('Uso: node deploy/local/agregar-clave-contingencia.mjs DIRECTORIO_PRIVADO');
const project=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),root=resolvePrivateDirectory(target,project);
const secrets=join(root,'secrets');
if(!existsSync(secrets)||!statSync(secrets).isDirectory())throw new Error('No existe el directorio de secretos de esta instalación. Ejecute primero prepare.mjs.');
const file=join(secrets,'contingencia_clave_operaciones');
if(existsSync(file))throw new Error('El secreto contingencia_clave_operaciones ya existe; no se reemplaza (cambiarlo invalida las ventanas offline emitidas).');
writeFileSync(file,randomBytes(36).toString('base64url'),{mode:0o600,flag:'wx'});
console.log('Secreto contingencia_clave_operaciones creado (permisos 0600). Reinicie el backend. No se muestra su valor.');
