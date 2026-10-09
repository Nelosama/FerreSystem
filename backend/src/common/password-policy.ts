import { registerDecorator, ValidationOptions } from 'class-validator';

const BLOQUEADAS = ['ferre2026!', 'ferreadmin2026!', 'ferre2026', 'password1', '12345678', 'admin1234', 'contraseña1'];

export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener al menos 8 caracteres, con letras y números, y no puede ser una contraseña predeterminada conocida';

export function isPasswordAllowed(value: unknown): boolean {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128 &&
    /[A-Za-z]/.test(value) && /\d/.test(value) && !BLOQUEADAS.includes(value.toLowerCase());
}

export function IsAllowedPassword(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isAllowedPassword',
      target: target.constructor,
      propertyName,
      options: { message: PASSWORD_POLICY_MESSAGE, ...options },
      validator: { validate: isPasswordAllowed },
    });
}
