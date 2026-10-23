import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

/** Enlace de un panel o del rail. `sinRed` atenúa el acceso y `pista` explica por qué (solo informa, no bloquea). */
export interface RailLink {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
  sinRed?: boolean;
  pista?: string;
}
export interface RailGroup { titulo: string; items: RailLink[] }
/**
 * Entrada del rail: un enlace directo (`to`) o un botón que abre un panel con grupos de enlaces (`grupos`).
 * El rail no decide qué se ofrece: quien lo usa le entrega solo lo autorizado y habilitado.
 */
export interface RailEntry {
  key: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  end?: boolean;
  ayuda?: string;
  sinRed?: boolean;
  pista?: string;
  grupos?: RailGroup[];
}

interface IconRailProps {
  /** Clase de contexto (por ejemplo `cajero-rail` o `admin-rail`) para estilos y pruebas propias de cada rol. */
  className: string;
  ariaLabel: string;
  /** Marca (logotipo) enlazada a Inicio. */
  marca: React.ReactNode;
  marcaEtiqueta: string;
  entradas: RailEntry[];
  /** Contenido sobre el avatar (por ejemplo, el estado de conexión). */
  pie?: React.ReactNode;
  avatar: { inicial: string; titulo?: string };
}

const rutaActiva = (pathname: string, to: string, end?: boolean) =>
  end || to === '/' ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

/**
 * Rail lateral de iconos (84 px). Los paneles se abren con clic o teclado, se cierran con Escape o al pulsar fuera
 * o al cambiar de ruta, y devuelven el foco a su botón. El estado activo toma el color del negocio (`--color-primary`).
 */
export const IconRail: React.FC<IconRailProps> = ({ className, ariaLabel, marca, marcaEtiqueta, entradas, pie, avatar }) => {
  const { pathname } = useLocation();
  // El panel guarda la ruta en la que se abrió: al navegar a otra ruta queda cerrado sin efectos adicionales.
  const [abierto, setAbierto] = React.useState<{ key: string; ruta: string } | null>(null);
  const raiz = React.useRef<HTMLElement>(null);
  const botones = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const claveAbierta = abierto && abierto.ruta === pathname ? abierto.key : null;

  React.useEffect(() => {
    if (!claveAbierta) return;
    const fuera = (event: MouseEvent) => { if (raiz.current && !raiz.current.contains(event.target as Node)) setAbierto(null); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [claveAbierta]);

  const alTeclado = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && claveAbierta) {
      const clave = claveAbierta;
      setAbierto(null);
      botones.current[clave]?.focus();
    }
  };

  return (
    <nav ref={raiz} className={`app-rail ${className} desktop-sidebar-nav`} aria-label={ariaLabel} onKeyDown={alTeclado}>
      <Link to="/" aria-label={marcaEtiqueta} className="app-rail-brand">{marca}</Link>

      <ul className="app-rail-list">
        {entradas.map(entrada => {
          const Icon = entrada.icon;
          const contenido = (
            <>
              <span className="app-rail-pill"><Icon size={20} strokeWidth={2} aria-hidden="true" /></span>
              <span>{entrada.label}</span>
              {entrada.sinRed && entrada.pista && <span className="sr-only">{' — '}{entrada.pista}</span>}
            </>
          );
          if (entrada.to) {
            return <li key={entrada.key}>
              <NavLink to={entrada.to} end={entrada.end} title={entrada.sinRed ? entrada.pista : entrada.ayuda}
                className={({ isActive }) => `app-rail-item${isActive ? ' is-active' : ''}${entrada.sinRed ? ' sin-red' : ''}`}>
                {contenido}
              </NavLink>
            </li>;
          }
          const grupos = entrada.grupos ?? [];
          const abiertoAqui = claveAbierta === entrada.key;
          const contieneRuta = grupos.some(g => g.items.some(i => rutaActiva(pathname, i.to, i.end)));
          const idPanel = `app-rail-panel-${entrada.key}`;
          return <li key={entrada.key} className="app-rail-mas">
            <button type="button" ref={el => { botones.current[entrada.key] = el; }}
              className={`app-rail-item${contieneRuta ? ' is-active' : ''}${abiertoAqui ? ' is-open' : ''}`}
              aria-expanded={abiertoAqui} aria-controls={abiertoAqui ? idPanel : undefined}
              onClick={() => setAbierto(abiertoAqui ? null : { key: entrada.key, ruta: pathname })}>
              {contenido}
            </button>
            {abiertoAqui && <nav id={idPanel} className="app-rail-panel" aria-label={entrada.label}>
              {grupos.map(grupo => <div key={grupo.titulo} className="app-rail-grupo">
                {grupo.titulo && <span className="app-rail-grupo-titulo">{grupo.titulo}</span>}
                <ul>
                  {grupo.items.map(item => {
                    const ItemIcon = item.icon;
                    return <li key={item.key}>
                      <NavLink to={item.to} end={item.end}
                        className={({ isActive }) => `app-rail-link${isActive ? ' is-active' : ''}${item.sinRed ? ' sin-red' : ''}`}>
                        <ItemIcon size={16} strokeWidth={2} aria-hidden="true" /><span>{item.label}</span>
                        {item.sinRed && item.pista && <small className="app-rail-hint">{item.pista}</small>}
                      </NavLink>
                    </li>;
                  })}
                </ul>
              </div>)}
            </nav>}
          </li>;
        })}
      </ul>

      {pie && <div className="app-rail-pie">{pie}</div>}
      <span className="app-rail-avatar" title={avatar.titulo} aria-hidden="true">{avatar.inicial}</span>
    </nav>
  );
};
