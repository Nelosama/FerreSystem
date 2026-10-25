import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUsuarioDto } from '../usuarios/dto/create-usuario.dto';
import { CreateTenantAdminDto } from '../super-admin/tenant-admin.dto';
import { isPasswordAllowed } from './password-policy';

describe('política de contraseñas (FS-03)', () => {
  it.each(['Ferre2026!', 'FERRE2026!', 'FerreAdmin2026!', 'corta1', 'sololetras', '12345678'])('rechaza %s', p => expect(isPasswordAllowed(p)).toBe(false));
  it('acepta una contraseña robusta', () => expect(isPasswordAllowed('Tornillo-84-Azul')).toBe(true));
  it('rechaza contraseñas que bcrypt truncaría silenciosamente, incluso Unicode', () => {
    expect(isPasswordAllowed('A1' + 'x'.repeat(71))).toBe(false);
    expect(isPasswordAllowed('A1' + 'ñ'.repeat(36))).toBe(false);
  });
  it('CreateUsuarioDto rechaza la contraseña predeterminada anterior', async () => {
    const e = await validate(plainToInstance(CreateUsuarioDto, { nombre: 'A', email: 'a@b.hn', password: 'Ferre2026!' }));
    expect(e.some(x => x.property === 'password')).toBe(true);
  });
  it('CreateTenantAdminDto rechaza FerreAdmin2026!', async () => {
    const e = await validate(plainToInstance(CreateTenantAdminDto, { nombre: 'A', email: 'a@b.hn', password: 'FerreAdmin2026!' }));
    expect(e.some(x => x.property === 'password')).toBe(true);
  });
});
