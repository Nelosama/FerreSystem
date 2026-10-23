import React from 'react';
import { AREAS_PLATAFORMA, ETIQUETA_SECCION, areaDeSeccion, type SeccionPlataforma } from '../config/platformNavigation';

/** Pestañas de la sección actual dentro de su área. Solo se muestran si el área tiene más de una sección. */
export const PlatformTabs: React.FC<{ seccion: SeccionPlataforma; onSelect: (seccion: SeccionPlataforma) => void }> = ({ seccion, onSelect }) => {
  const area = AREAS_PLATAFORMA.find(item => item.id === areaDeSeccion(seccion));
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  if (!area || area.secciones.length < 2) return null;

  // Flechas izquierda/derecha mueven el foco entre pestañas (patrón de tablist).
  const moverFoco = (event: React.KeyboardEvent, indice: number) => {
    const total = area.secciones.length;
    const salto = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!salto) return;
    event.preventDefault();
    const siguiente = area.secciones[(indice + salto + total) % total];
    refs.current[siguiente]?.focus();
    onSelect(siguiente);
  };

  return <div role="tablist" aria-label={area.etiqueta} className="platform-tabs">
    {area.secciones.map((item, indice) => {
      const activa = item === seccion;
      const etiqueta = ETIQUETA_SECCION[item];
      return <button
        key={item}
        ref={el => { refs.current[item] = el; }}
        type="button"
        role="tab"
        id={`plataforma-tab-${item}`}
        aria-selected={activa}
        tabIndex={activa ? 0 : -1}
        className="platform-tab"
        onClick={() => onSelect(item)}
        onKeyDown={event => moverFoco(event, indice)}
      >
        <span className="platform-tab-long">{etiqueta.larga}</span>
        <span className="platform-tab-short">{etiqueta.corta ?? etiqueta.larga}</span>
      </button>;
    })}
  </div>;
};
