export const readStoredJson = <T>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) ?? fallback) as T : fallback;
  } catch {
    return fallback;
  }
};

export const parseStoredArray = <T>(value: string | null): T[] => {
  try {
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const readStoredArray = <T>(key: string): T[] => {
  try {
    return parseStoredArray<T>(localStorage.getItem(key));
  } catch {
    return [];
  }
};
