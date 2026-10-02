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
});
