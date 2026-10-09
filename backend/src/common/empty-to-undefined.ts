import { Transform } from 'class-transformer';

/** Un campo opcional enviado como '' (formularios vacíos) se trata como ausente. */
export const EmptyToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));
