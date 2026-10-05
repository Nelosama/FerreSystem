import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolvePrivateDirectory } from '../../backend/scripts/private-directory.mjs';
const [target,host,email,name]=process.argv.slice(2);
if(!target||!host||!email||!name)throw new Error('Uso: node deploy/local/prepare.mjs DIRECTORIO_PRIVADO HOST_LAN CORREO_ADMIN NOMBRE_NEGOCIO');
if(!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(host)||!/^\S+@\S+\.\S+$/.test(email))throw new Error('Host o correo inválidos');
const project=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),root=resolvePrivateDirectory(target,project);
if(existsSync(root))throw new Error('El destino ya existe. No se reemplazan secretos ni respaldos.');
mkdirSync(dirname(root),{recursive:true,mode:0o700});
mkdirSync(root,{mode:0o700});
mkdirSync(join(root,'secrets'),{mode:0o700});mkdirSync(join(root,'backups'),{mode:0o700});
for(const file of ['database_admin_password','database_password','jwt_secret','initial_admin_password'])writeFileSync(join(root,'secrets',file),randomBytes(36).toString('base64url'),{mode:0o600,flag:'wx'});
// Compose interpreta $$ como un dólar literal dentro de valores entre comillas.
const quote=value=>JSON.stringify(value).replaceAll('$',()=> '$$');
writeFileSync(join(root,'local.env'),[`LOCAL_UID=${process.getuid?.() ?? 0}`,`LOCAL_GID=${process.getgid?.() ?? 0}`,`FERRE_HOST=${quote(host)}`,`INITIAL_ADMIN_EMAIL=${quote(email)}`,`INITIAL_TENANT_NAME=${quote(name)}`,`SECRETS_DIRECTORY=${quote(join(root,'secrets'))}`,`BACKUP_DIRECTORY=${quote(join(root,'backups'))}`].join('\n')+'\n',{mode:0o600,flag:'wx'});
console.log('Configuración y secretos creados fuera del repositorio. Conserve la contraseña inicial en su gestor de contraseñas.');
