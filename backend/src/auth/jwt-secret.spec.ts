import { ConfigService } from '@nestjs/config';
import { getJwtSecret } from './jwt-secret';

describe('JWT secret', () => {
  const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as ConfigService;
  it('rechaza producción con el secreto público de desarrollo como fallback', () => {
    expect(() => getJwtSecret(config({ NODE_ENV: 'production' }))).toThrow('obligatorio');
  });
  it('usa el secreto configurado y mantiene el fallback local de desarrollo', () => {
    expect(getJwtSecret(config({ NODE_ENV: 'production', JWT_SECRET: 'test-secret' }))).toBe('test-secret');
    expect(getJwtSecret(config({ NODE_ENV: 'development' }))).toContain('dev-secret');
  });
  it('no usa el secreto público si NODE_ENV no está definido ni es de desarrollo o pruebas', () => {
    expect(() => getJwtSecret(config({}))).toThrow('obligatorio');
    expect(() => getJwtSecret(config({ NODE_ENV: 'staging' }))).toThrow('obligatorio');
    expect(() => getJwtSecret(config({ NODE_ENV: 'Production' }))).toThrow('obligatorio');
    expect(getJwtSecret(config({ NODE_ENV: 'test' }))).toContain('dev-secret');
  });
  it.each(['production', 'Production', 'staging', ''])('rechaza el secreto público configurado explícitamente en %s', (NODE_ENV) => {
    const publicSecret = getJwtSecret(config({ NODE_ENV: 'test' }));
    expect(() => getJwtSecret(config({ NODE_ENV, JWT_SECRET: publicSecret }))).toThrow('JWT_SECRET');
  });
  it.each(['', ' ', '\t\n'])('rechaza secretos vacíos o en blanco fuera de desarrollo', (JWT_SECRET) => {
    expect(() => getJwtSecret(config({ NODE_ENV: 'production', JWT_SECRET }))).toThrow('JWT_SECRET');
  });
  it('rechaza el placeholder público de la plantilla antigua', () => {
    expect(() => getJwtSecret(config({ NODE_ENV: 'production', JWT_SECRET: 'cambiar-por-un-secreto-seguro-de-al-menos-32-caracteres' }))).toThrow('JWT_SECRET');
  });
  it('conserva exactamente la clave privada configurada y no la incluye en errores', () => {
    const secret = '  private-test-key-with-intentional-spaces  ';
    expect(getJwtSecret(config({ NODE_ENV: 'production', JWT_SECRET: secret }))).toBe(secret);
    const publicSecret = getJwtSecret(config({ NODE_ENV: 'development' }));
    const invalidConfiguration = () => getJwtSecret(config({ NODE_ENV: 'production', JWT_SECRET: ` ${publicSecret} ` }));
    expect(invalidConfiguration).toThrow('JWT_SECRET');
    expect(invalidConfiguration).not.toThrow(publicSecret);
  });
});
