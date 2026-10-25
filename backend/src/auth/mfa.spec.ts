import { openSecret, sealSecret, totp, tokenHash, validStep, requireMfa } from './mfa';
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const config = { get: () => 'ab'.repeat(32) } as any;
describe('MFA cryptographic contracts', () => {
  it.each([[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']])('matches RFC 6238 SHA1 vector at %s seconds', (seconds, expected) => {
    expect(totp(secret, Math.floor(Number(seconds) / 30), 8)).toBe(expected);
  });
  it('authenticates encryption, binds owner and requires a dedicated key', () => {
    const ciphertext = sealSecret(secret, 'owner-A', config);
    expect(ciphertext).not.toContain(secret);
    expect(openSecret(ciphertext, 'owner-A', config)).toBe(secret);
    expect(() => openSecret(ciphertext, 'owner-B', config)).toThrow();
    expect(() => sealSecret(secret, 'owner-A', { get: () => undefined } as any)).toThrow();
  });
  it('rejects expired codes and malformed input', () => {
    const code = totp(secret, 100);
    expect(validStep(secret, code, 3000000)).toBe(100);
    expect(validStep(secret, code, 3090000)).toBeNull();
    expect(validStep(secret, '12345')).toBeNull();
  });
  it('fails closed for unenrolled Super Admin and reused moving factors', async () => {
    await expect(requireMfa({}, { id: 'sa' }, true, '123456', config)).rejects.toThrow();
    const prisma = { superAdmin: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    await expect(requireMfa(prisma, { id: 'sa', mfaSecret: sealSecret(secret, 'sa', config) }, true, totp(secret, Math.floor(Date.now()/30000)), config)).rejects.toThrow();
  });
  it('consumes only the emergency code matching the account and kind', async () => {
    const code = 'a'.repeat(32), remove = vi.fn().mockResolvedValue({ count: 1 });
    await requireMfa({ authRecoveryCode: { deleteMany: remove } }, { id: 'sa', mfaSecret: 'encrypted' }, true, code, config);
    expect(remove).toHaveBeenCalledWith({ where: { sujetoId: 'sa', tipo: 'SUPER_ADMIN', hash: tokenHash(code) } });
  });
});
