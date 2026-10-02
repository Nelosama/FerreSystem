export const readStoredJson = <T>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) ?? fallback) as T : fallback;
  } catch {
    return fallback;
  }
};
