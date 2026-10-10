import { escribirClave, leerClave, borrarClave } from './db';
import type { LineaLocal } from './journal';

// Ventana de contingencia autorizada por el servidor, catálogo local y datos del equipo.
// No contiene tokens ni contraseñas: la sesión sigue en la forma habitual de la aplicación.

export interface ProductoVenta {
  id: string;
  codigo: string;
  codigoBarras: string | null;
  nombre: string;
  precioCentavos: number;
  libreCentesimas: number;
  cupoCentesimas: number;
  usaMedida: boolean;
  unidadMedida: string;
}

export interface VentanaLocal {
  ventanaId: string;
  tenantId: string;
  dispositivoId: string;
  cajaId: string;
  cajeroId: string;
  vigenteHasta: string;
  catalogoHash: string;
  productos: ProductoVenta[];
  sincronizadaAt: string;
  limites: { montoMaxVentaCentavos?: number; montoMaxAcumuladoCentavos?: number; cupoPorcentaje?: number };
}

export interface DispositivoLocal { id: string; codigo: string; nombre: string; registrado: boolean }

export interface BorradorLocal {
  cajeroId: string;
  lineas: LineaLocal[];
  clienteNombre: string;
  clienteRtn: string;
  efectivoTexto: string;
  guardadoAt: string;
}

export const ventanaVigente = (v: VentanaLocal | undefined, ahora = Date.now()) =>
  !!v && new Date(v.vigenteHasta).getTime() > ahora;

export const guardarVentana = (v: VentanaLocal) => escribirClave('ventana', 'activa', v);
export const leerVentana = () => leerClave<VentanaLocal>('ventana', 'activa');

export const guardarDispositivo = (d: DispositivoLocal) => escribirClave('meta', 'dispositivo', d);
export const leerDispositivo = () => leerClave<DispositivoLocal>('meta', 'dispositivo');

export const guardarBorrador = (b: BorradorLocal) => escribirClave('borrador', 'activo', b);
export const leerBorrador = () => leerClave<BorradorLocal>('borrador', 'activo');
export const borrarBorrador = () => borrarClave('borrador', 'activo');

/** Crea o recupera el identificador estable del equipo. Se conserva al cerrar sesión: es del equipo, no del usuario. */
export async function identificadorDispositivo(): Promise<DispositivoLocal> {
  const existente = await leerDispositivo();
  if (existente) return existente;
  const nuevo: DispositivoLocal = { id: crypto.randomUUID(), codigo: '01', nombre: 'Caja de contingencia', registrado: false };
  await guardarDispositivo(nuevo);
  return nuevo;
}
