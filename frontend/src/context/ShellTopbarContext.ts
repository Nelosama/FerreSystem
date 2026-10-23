import React from 'react';

/**
 * Indica que la página se muestra dentro de un shell que ya ofrece su propia barra superior (Super Admin y Administrador).
 * Ahí esa barra aporta negocio, sucursal, notificaciones, usuario y cierre de sesión, así que TopBar solo dibuja el
 * encabezado de la página y no repite esos controles.
 */
export const ShellTopbarContext = React.createContext(false);
