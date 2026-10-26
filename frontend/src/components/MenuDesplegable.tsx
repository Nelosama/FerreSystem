import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { calcularPosicionMenu, type PosicionMenu } from '../utils/posicionMenu';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  icono?: React.ReactNode;
  /** Atributo `data-guide` que usa la guía de uso para señalar la opción. */
  guia?: string;
  title?: string;
}

interface MenuDesplegableProps {
  etiqueta: string;
  items: MenuItem[];
  /** Nombre accesible del menú (por ejemplo, «Gestionar empresa: Ferretería X»). */
  nombreAccesible?: string;
}

const ANCHO_MENU = 248;

/**
 * Menú de acciones que se abre sobre el contenido (portal en `body`): nunca lo recorta el `overflow` de una tarjeta o
 * tabla y se reposiciona dentro del viewport (arriba o abajo, sin desbordar a los lados). Se cierra con Escape, clic
 * fuera, desplazamiento o al elegir una opción, y devuelve el foco a su botón. Teclado: flechas, Inicio y Fin.
 */
export const MenuDesplegable: React.FC<MenuDesplegableProps> = ({ etiqueta, items, nombreAccesible }) => {
  const [abierto, setAbierto] = React.useState(false);
  const [posicion, setPosicion] = React.useState<PosicionMenu | null>(null);
  const boton = React.useRef<HTMLButtonElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const id = React.useId();

  const cerrar = React.useCallback((devolverFoco = true) => {
    setAbierto(false);
    setPosicion(null);
    if (devolverFoco) boton.current?.focus();
  }, []);

  // Mide el panel ya pintado (oculto hasta tener posición) y lo ubica según el espacio disponible.
  React.useLayoutEffect(() => {
    if (!abierto || !boton.current || !panel.current) return;
    const colocar = () => {
      if (!boton.current || !panel.current) return;
      const rect = boton.current.getBoundingClientRect();
      const altoNatural = panel.current.scrollHeight;
      setPosicion(calcularPosicionMenu(rect, { ancho: ANCHO_MENU, alto: altoNatural }, { ancho: window.innerWidth, alto: window.innerHeight }));
    };
    colocar();
    window.addEventListener('resize', colocar);
    return () => window.removeEventListener('resize', colocar);
  }, [abierto, items.length]);

  React.useEffect(() => {
    if (!abierto) return;
    const fuera = (event: MouseEvent) => {
      const objetivo = event.target as Node;
      if (panel.current?.contains(objetivo) || boton.current?.contains(objetivo)) return;
      cerrar(false);
    };
    // Un desplazamiento real de la página deja el menú desanclado de su botón y lo cierra. Los desplazamientos del propio
    // menú y los mínimos que provoca el foco al abrirlo no cuentan.
    const baseY = window.scrollY;
    const desplazar = (event: Event) => {
      if (panel.current?.contains(event.target as Node)) return;
      if ((event.target === document || event.target === document.documentElement) && Math.abs(window.scrollY - baseY) < 4) return;
      cerrar(false);
    };
    document.addEventListener('mousedown', fuera);
    window.addEventListener('scroll', desplazar, true);
    return () => { document.removeEventListener('mousedown', fuera); window.removeEventListener('scroll', desplazar, true); };
  }, [abierto, cerrar]);

  // El foco pasa a la primera opción cuando el panel ya es visible (no se puede enfocar un elemento oculto).
  const listo = posicion !== null;
  React.useEffect(() => {
    if (abierto && listo) panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [abierto, listo]);

  const alTeclado = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); cerrar(); return; }
    if (event.key === 'Tab') { cerrar(false); return; }
    const opciones = Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const actual = opciones.indexOf(document.activeElement as HTMLElement);
    const mover = (indice: number) => { event.preventDefault(); opciones[(indice + opciones.length) % opciones.length]?.focus(); };
    if (event.key === 'ArrowDown') mover(actual + 1);
    else if (event.key === 'ArrowUp') mover(actual - 1);
    else if (event.key === 'Home') mover(0);
    else if (event.key === 'End') mover(opciones.length - 1);
  };

  return (
    <>
      <button ref={boton} type="button" className="menu-desplegable-boton" aria-haspopup="menu" aria-expanded={abierto}
        aria-controls={abierto ? id : undefined} aria-label={nombreAccesible}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        onKeyDown={event => { if (event.key === 'ArrowDown' && !abierto) { event.preventDefault(); setAbierto(true); } }}>
        <span>{etiqueta}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      {abierto && createPortal(
        <div ref={panel} id={id} role="menu" aria-label={nombreAccesible ?? etiqueta} className="menu-desplegable-panel" onKeyDown={alTeclado}
          style={{
            width: ANCHO_MENU,
            top: posicion?.top ?? 0,
            left: posicion?.left ?? 0,
            maxHeight: posicion?.maxHeight,
            visibility: posicion ? 'visible' : 'hidden',
          }}>
          {items.map(item => (
            <button key={item.key} type="button" role="menuitem" className="menu-desplegable-item" data-guide={item.guia} title={item.title}
              onClick={() => { cerrar(false); item.onSelect(); }}>
              {item.icono}<span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
};
