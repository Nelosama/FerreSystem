// Almacén local (IndexedDB). Cada alta de operación se confirma solo cuando la transacción termina ("complete").
// La durabilidad estricta se pide cuando el navegador la soporta; el apagón eléctrico NO está garantizado sin pruebas reales.
export type NombreAlmacen = 'operaciones' | 'ventana' | 'borrador' | 'meta';

const NOMBRE_BASE = 'ferresystem-contingencia';
let base: Promise<IDBDatabase> | null = null;
let ultimaDurabilidad: string = 'desconocida';

export const durabilidadDeEscritura = () => ultimaDurabilidad;

export function almacenamientoDisponible(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function abrirBase(): Promise<IDBDatabase> {
  if (!base) {
    base = new Promise<IDBDatabase>((resolve, reject) => {
      const peticion = indexedDB.open(NOMBRE_BASE, 1);
      peticion.onupgradeneeded = () => {
        const db = peticion.result;
        if (!db.objectStoreNames.contains('operaciones')) {
          const ops = db.createObjectStore('operaciones', { keyPath: 'operacionId' });
          ops.createIndex('estado', 'estado');
          ops.createIndex('secuencia', 'secuenciaLocal');
        }
        for (const nombre of ['ventana', 'borrador', 'meta']) {
          if (!db.objectStoreNames.contains(nombre)) db.createObjectStore(nombre);
        }
      };
      peticion.onsuccess = () => {
        const db = peticion.result;
        db.onversionchange = () => { db.close(); base = null; };
        resolve(db);
      };
      peticion.onerror = () => { base = null; reject(peticion.error ?? new Error('No se pudo abrir la base local')); };
      peticion.onblocked = () => reject(new Error('La base local está en uso por otra versión de la aplicación. Cierre las demás pestañas.'));
    });
  }
  return base;
}

/**
 * Ejecuta `trabajo` dentro de una transacción. `trabajo` emite peticiones y deja su resultado en `salida.valor`.
 * La promesa resuelve solo en `complete`; `abort` o error de cuota rechazan y nada queda a medias.
 */
export async function transaccion<T>(
  almacenes: NombreAlmacen[],
  modo: IDBTransactionMode,
  trabajo: (tx: IDBTransaction, salida: { valor?: T }) => void,
): Promise<T> {
  const db = await abrirBase();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(almacenes, modo, { durability: 'strict' });
    } catch {
      tx = db.transaction(almacenes, modo);
    }
    const salida: { valor?: T } = {};
    tx.oncomplete = () => {
      ultimaDurabilidad = String((tx as IDBTransaction & { durability?: string }).durability ?? 'desconocida');
      resolve(salida.valor as T);
    };
    tx.onabort = () => reject(tx.error ?? new Error('La operación local fue cancelada y no se guardó'));
    try {
      trabajo(tx, salida);
    } catch (error) {
      try { tx.abort(); } catch { /* ya finalizada */ }
      reject(error);
    }
  });
}

export function leerClave<T>(almacen: 'ventana' | 'borrador' | 'meta', clave: string): Promise<T | undefined> {
  return transaccion<T | undefined>([almacen], 'readonly', (tx, salida) => {
    const peticion = tx.objectStore(almacen).get(clave);
    peticion.onsuccess = () => { salida.valor = peticion.result as T | undefined; };
  });
}

export function escribirClave(almacen: 'ventana' | 'borrador' | 'meta', clave: string, valor: unknown): Promise<void> {
  return transaccion<void>([almacen], 'readwrite', (tx) => { tx.objectStore(almacen).put(valor, clave); });
}

export function borrarClave(almacen: 'ventana' | 'borrador' | 'meta', clave: string): Promise<void> {
  return transaccion<void>([almacen], 'readwrite', (tx) => { tx.objectStore(almacen).delete(clave); });
}
