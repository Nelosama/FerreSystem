/**
 * Lógica pura de las notificaciones: textos, opciones de SweetAlert2 y control de duplicados.
 * No toca el DOM ni importa SweetAlert2, así puede probarse con node:test (ver alertas.ts para la presentación).
 */

export type TipoToast = 'exito' | 'error' | 'advertencia';

export type Traductor = (clave: string) => string;

export interface OpcionesConfirmacion {
  texto: string;
  titulo?: string;
  confirmar?: string;
  cancelar?: string;
  /** Acción destructiva o difícil de deshacer: el foco inicial va a Cancelar para evitar un Enter accidental. */
  peligroso?: boolean;
}

const ICONO: Record<TipoToast, 'success' | 'error' | 'warning'> = {
  exito: 'success',
  error: 'error',
  advertencia: 'warning',
};

export const iconoToast = (tipo: TipoToast) => ICONO[tipo];

// Los errores permanecen más tiempo para dar tiempo a leerlos; el resto se cierra solo.
export const duracionToast = (tipo: TipoToast) => (tipo === 'error' ? 6000 : 3500);

/** Devuelve la traducción de la clave, o el respaldo cuando la clave no existe en el diccionario. */
export const textoTraducido = (traductor: Traductor | null, clave: string, respaldo: string) => {
  const texto = traductor?.(clave);
  return texto && texto !== clave ? texto : respaldo;
};

export const opcionesConfirmacion = (opciones: OpcionesConfirmacion, traductor: Traductor | null) => ({
  icon: opciones.peligroso ? ('warning' as const) : ('question' as const),
  title: opciones.titulo ?? textoTraducido(traductor, 'alerts.confirm_title', '¿Está seguro?'),
  text: opciones.texto,
  confirmButtonText: opciones.confirmar ?? textoTraducido(traductor, 'alerts.confirm', 'Confirmar'),
  cancelButtonText: opciones.cancelar ?? textoTraducido(traductor, 'alerts.cancel', 'Cancelar'),
  focusConfirm: !opciones.peligroso,
  focusCancel: Boolean(opciones.peligroso),
});

/**
 * Filtra mensajes idénticos que llegan en una ventana corta (p. ej. doble clic o reintentos).
 * Devuelve true cuando el mensaje debe mostrarse.
 */
export const crearControlDuplicados = (ventanaMs = 2000) => {
  let ultimo: { texto: string; momento: number } | null = null;
  return (texto: string, ahora: number) => {
    if (ultimo && ultimo.texto === texto && ahora - ultimo.momento < ventanaMs) return false;
    ultimo = { texto, momento: ahora };
    return true;
  };
};
