export type ProductCommand = { solicitudId: string; nombre: string; [key: string]: unknown };

// One immutable request per user/company. Persist BEFORE sending: a lost response
// can always be retried with the same identity, including after a page reload.
export function productCreation(key: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  post: (body: ProductCommand) => Promise<unknown>, uuid: () => string) {
  let inFlight = false;
  const pending = (): ProductCommand | null => {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value.nombre !== 'string' || typeof value.solicitudId !== 'string') {
      throw new Error('No se pudo leer el alta pendiente. Conserve los datos locales y solicite ayuda.');
    }
    return value;
  };
  const clear = (command: ProductCommand) => {
    if (pending()?.solicitudId === command.solicitudId) storage.removeItem(key);
  };
  return {
    pending,
    async save(body?: Omit<ProductCommand, 'solicitudId'>) {
      if (inFlight) return false;
      inFlight = true;
      try {
        let command = pending();
        const fresh = !command;
        if (!command) {
          if (!body) throw new Error('No hay un alta pendiente.');
          command = { ...body, solicitudId: uuid() } as ProductCommand;
          storage.setItem(key, JSON.stringify(command));
        }
        try { await post(command); }
        catch (error: any) {
          // A rejected retry does NOT prove the original attempt failed (e.g.
          // permission revoked after a commit whose response was lost).
          if (fresh && [400, 404, 409, 422].includes(error.response?.status)) clear(command);
          throw error;
        }
        clear(command);
        return true;
      } finally { inFlight = false; }
    },
  };
}
