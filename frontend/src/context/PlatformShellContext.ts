import React from 'react';

/**
 * Indica que la página se muestra dentro del shell del Super Admin. Ahí la topbar de plataforma ya ofrece idioma,
 * usuario, notificaciones y cierre de sesión, así que TopBar solo dibuja el encabezado de la página.
 */
export const PlatformShellContext = React.createContext(false);
