// Aviso para la próxima visita al login (p. ej. «contraseña actualizada»). Vive solo en memoria, como el aviso de
// sesión vencida: el cierre de sesión redirige como transición y el estado de navegación no siempre llega al login.
let aviso: string | null = null;
export const dejarAvisoLogin = (texto: string) => { aviso = texto; };
export const leerAvisoLogin = () => aviso;
export const limpiarAvisoLogin = () => { aviso = null; };
