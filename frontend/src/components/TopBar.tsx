import React from 'react';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

/**
 * Encabezado de página (título y subtítulo). El negocio, la sucursal, la búsqueda, las notificaciones, el usuario y el
 * cierre de sesión viven en la barra superior del shell híbrido (AdminTopbar / PlatformTopbar), que es la única que los ofrece.
 */
export const TopBar: React.FC<TopBarProps> = ({ title, subtitle }) => (
  <header className="shell-page-header">
    <h1>{title}</h1>
    {subtitle && <p>{subtitle}</p>}
  </header>
);
