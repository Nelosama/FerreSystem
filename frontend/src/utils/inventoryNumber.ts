// CSV values must be complete decimal literals; never accept a numeric prefix.
export function inventoryNumber(value: string, fallback: number): number {
  const input = value.trim();
  if (!input) return fallback;
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return NaN;
  const number = Number(input);
  return Number.isFinite(number) && number <= 9999999999.99 ? number : NaN;
}
