/**
 * Servicio central de notificaciones y confirmaciones (SweetAlert2).
 *
 * - Toast (no bloquea): éxitos, errores y advertencias que no requieren respuesta.
 * - Modal de confirmación (bloquea): solo cuando el usuario debe decidir antes de que se envíe una operación.
 *
 * Los colores salen de los tokens CSS de la marca (TenantContext) y los textos de los botones del diccionario activo.
 */
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import './alertas.css';
import {
  crearControlDuplicados,
  duracionToast,
  iconoToast,
  opcionesConfirmacion,
  textoTraducido,
  type OpcionesConfirmacion,
  type Traductor,
  type TipoToast,
} from './alertasOpciones';

let traductor: Traductor | null = null;
// Una confirmación abierta no puede ser sustituida por un toast (Swal reemplaza el popup activo).
let confirmacionAbierta = false;
// Mensajes de toast que llegaron mientras una confirmación seguía abierta; se muestran al cerrarla.
let pendientes: Array<{ tipo: TipoToast; mensaje: string }> = [];
const esNuevo = crearControlDuplicados();

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  showCloseButton: true,
  timerProgressBar: true,
  customClass: { popup: 'ferre-toast', closeButton: 'ferre-toast-cerrar' },
});

const mostrarToast = (tipo: TipoToast, mensaje: string) => {
  if (!mensaje || !esNuevo(mensaje, Date.now())) return;
  if (confirmacionAbierta) {
    pendientes.push({ tipo, mensaje });
    return;
  }
  void Toast.fire({ icon: iconoToast(tipo), title: mensaje, timer: duracionToast(tipo) });
};

const vaciarPendientes = () => {
  const cola = pendientes;
  pendientes = [];
  cola.forEach(({ tipo, mensaje }) => mostrarToast(tipo, mensaje));
};

/** Enlaza el traductor del idioma activo (I18nContext). Sin él, se usan los textos en español. */
export const registrarTraductor = (fn: Traductor | null) => {
  traductor = fn;
};

const traducir = (clave: string, respaldo: string) => textoTraducido(traductor, clave, respaldo);

/**
 * Pide confirmación antes de una operación. Resuelve true solo si el usuario acepta.
 * Si ya hay una confirmación abierta, rechaza la nueva llamada (false): nunca se ejecuta una acción sin su confirmación.
 */
const confirmar = async (opciones: OpcionesConfirmacion): Promise<boolean> => {
  if (confirmacionAbierta) return false;
  confirmacionAbierta = true;
  const resultado = await Swal.fire({
    ...opcionesConfirmacion(opciones, traductor),
    showCancelButton: true,
    allowOutsideClick: false,
    buttonsStyling: false,
    customClass: {
      popup: 'ferre-alerta',
      confirmButton: opciones.peligroso ? 'ferre-alerta-confirmar ferre-alerta-peligro' : 'ferre-alerta-confirmar',
      cancelButton: 'ferre-alerta-cancelar',
    },
    didClose: () => {
      confirmacionAbierta = false;
      vaciarPendientes();
    },
  });
  return resultado.isConfirmed === true;
};

export const alertas = {
  exito: (mensaje: string) => mostrarToast('exito', mensaje),
  error: (mensaje: string) => mostrarToast('error', mensaje),
  advertencia: (mensaje: string) => mostrarToast('advertencia', mensaje),
  toast: mostrarToast,
  confirmar,
  traducir,
};
