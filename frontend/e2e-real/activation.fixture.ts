import { expect, type APIRequestContext } from '@playwright/test';
import { syntheticMfaFor } from './mfa.fixture';

// Only synthetic users in the disposable pilot cluster may receive these links.
// Creation remains passwordless; the recipient redeems the private token separately.
export async function activateTestUser(request: APIRequestContext, usuarioId: string, tenantId = 'e2e-empresa-a') {
  const api = new URL(process.env.E2E_API_URL!);
  const db = new URL(process.env.DATABASE_URL!);
  if (process.env.NODE_ENV === 'production' || api.hostname !== '127.0.0.1' || db.hostname !== '127.0.0.1' || !tenantId.startsWith('e2e-')) {
    throw new Error('Activation fixture requires the disposable local pilot');
  }
  const email = 'superadmin.e2e@e2e.invalid';
  const password = process.env.E2E_PASSWORD!;
  const login = await request.post(`${api}/auth/login`, { data: { email, password, mfaCode: await syntheticMfaFor(email) } });
  expect(login.status(), 'synthetic platform issuer authenticates with MFA').toBe(200);
  const issued = await request.post(`${api}/auth/security/admin-reset`, {
    headers: { Authorization: `Bearer ${(await login.json()).accessToken}` },
    data: { usuarioId, tenantId, currentPassword: password, mfaCode: await syntheticMfaFor(email) },
  });
  expect(issued.status(), 'authorized issuer creates a private activation link').toBe(201);
  const { token, expiresIn } = await issued.json();
  expect(expiresIn).toBe(600);
  const reset = await request.post(`${api}/auth/security/reset`, { data: { token, password } });
  expect(reset.status(), 'synthetic recipient privately sets the password').toBe(200);
  const replay = await request.post(`${api}/auth/security/reset`, { data: { token, password } });
  expect(replay.status(), 'activation links cannot be reused').toBe(401);
}
