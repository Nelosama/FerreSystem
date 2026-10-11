import { claveAnteriorDeOperaciones, claveDeOperaciones, errorDeConfiguracionContingencia } from '../src/contingencia/clave-operaciones';

// CONTINGENCIA_CLAVE_OPERACIONES: validación de arranque, independencia de JWT_SECRET, transición y ausencia de secretos en mensajes.
const K1 = 'k1-clave-de-prueba-no-productiva-0000000001';
const K0 = 'k0-clave-anterior-de-prueba-no-prod-000001';
const JWT = 'jwt-secreto-de-prueba-no-productivo-000001';

describe('Clave de la contingencia: configuración de arranque', () => {
  it('la ausencia, un valor vacío o corto impiden arrancar con un mensaje controlado que remite a la documentación', () => {
    for (const env of [{}, { CONTINGENCIA_CLAVE_OPERACIONES: '' }, { CONTINGENCIA_CLAVE_OPERACIONES: ' '.repeat(40) }, { CONTINGENCIA_CLAVE_OPERACIONES: 'corta-pero-secreta' }]) {
      const msg = errorDeConfiguracionContingencia(env as any);
      expect(msg).toMatch(/CONTINGENCIA_CLAVE_OPERACIONES es obligatoria y debe tener al menos 32 caracteres/);
      expect(msg).toContain('docs/CONTINGENCIA_CLAVE_OPERACIONES.md');
      expect(msg).not.toContain('corta-pero-secreta');
    }
  });

  it('una clave válida arranca; la clave igual a JWT_SECRET se rechaza sin mostrar el valor', () => {
    expect(errorDeConfiguracionContingencia({ CONTINGENCIA_CLAVE_OPERACIONES: K1, JWT_SECRET: JWT } as any)).toBeNull();
    const msg = errorDeConfiguracionContingencia({ CONTINGENCIA_CLAVE_OPERACIONES: JWT, JWT_SECRET: JWT } as any)!;
    expect(msg).toMatch(/no puede ser igual a JWT_SECRET/);
    expect(msg).not.toContain(JWT);
  });

  it('transición: la clave anterior solo verifica, es opcional y se valida sin mostrar valores', () => {
    expect(claveAnteriorDeOperaciones({})).toBeNull();
    expect(claveAnteriorDeOperaciones({ CONTINGENCIA_CLAVE_OPERACIONES: K1, CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR: K0 } as any)).toBe(K0);
    // La clave anterior puede ser el JWT_SECRET con el que se derivaron las ventanas antiguas.
    expect(errorDeConfiguracionContingencia({ CONTINGENCIA_CLAVE_OPERACIONES: K1, CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR: JWT, JWT_SECRET: JWT } as any)).toBeNull();
    const corta = errorDeConfiguracionContingencia({ CONTINGENCIA_CLAVE_OPERACIONES: K1, CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR: 'anterior-corta' } as any)!;
    expect(corta).toMatch(/ANTERIOR debe tener al menos 32/);
    expect(corta).not.toContain('anterior-corta');
    const igual = errorDeConfiguracionContingencia({ CONTINGENCIA_CLAVE_OPERACIONES: K1, CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR: K1 } as any)!;
    expect(igual).toMatch(/debe ser distinta/);
    expect(igual).not.toContain(K1);
  });

  it('ningún error de ninguna combinación contiene el valor de una clave', () => {
    const valores = [K1, K0, JWT, 'abc'];
    for (const actual of [undefined, K1, JWT, 'abc']) for (const anterior of [undefined, K0, K1, 'abc']) {
      const env: any = { JWT_SECRET: JWT };
      if (actual) env.CONTINGENCIA_CLAVE_OPERACIONES = actual;
      if (anterior) env.CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR = anterior;
      const msg = errorDeConfiguracionContingencia(env);
      if (msg) for (const v of valores) expect(msg.includes(v), `${msg} contiene ${v}`).toBe(false);
    }
  });

  it('las funciones exportadas por el servicio son las mismas (compatibilidad con los consumidores existentes)', async () => {
    const servicio = await import('../src/contingencia/contingencia.service');
    expect(servicio.claveDeOperaciones).toBe(claveDeOperaciones);
    expect(servicio.claveAnteriorDeOperaciones).toBe(claveAnteriorDeOperaciones);
  });
});
