import React from 'react';

/**
 * Marca de Jowa System (el proveedor del sistema): monograma «J» sobre un cuadro de tinta neutra y, si se pide,
 * el nombre completo. No usa el color del negocio: identifica al producto en el inicio de sesión y la plataforma.
 */
export const MarcaJowa: React.FC<{ size?: number; conNombre?: boolean; className?: string }> = ({ size = 40, conNombre = false, className }) => (
  <span className={`marca-jowa${className ? ` ${className}` : ''}`}>
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="marca-jowa-simbolo">
      <rect width="48" height="48" rx="12" fill="#1F2933" />
      <path d="M28.5 12h6v16.2c0 6.1-4.1 9.8-10 9.8-5.3 0-9-3-10-8l5.8-1.4c.5 2.4 2 3.8 4.2 3.8 2.5 0 4-1.6 4-4.6V12Z" fill="#FFFFFF" />
      <rect x="13.5" y="12" width="11" height="5" rx="1.5" fill="#F59E0B" />
    </svg>
    {conNombre && <span className="marca-jowa-nombre">Jowa System</span>}
  </span>
);
