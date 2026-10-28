import { ServiceUnavailableException } from '@nestjs/common';
import { MODELO_OPENAI_POR_DEFECTO, OpenAIService, PLAZO_OPENAI_MS, validarConfiguracionOpenAI } from './openai.service';

// Cliente simulado: ninguna prueba llama a la API real. Valores sintéticos, nunca claves reales.
function montar(valores: Record<string, string | undefined>, create = vi.fn().mockResolvedValue({ output_text: 'Hola' })) {
  const config: any = { get: (clave: string) => valores[clave] };
  const fabrica = vi.fn(() => ({ responses: { create } }));
  return { servicio: new OpenAIService(config, fabrica), fabrica, create };
}

describe('OpenAIService', () => {
  it('sin OPENAI_API_KEY responde 503 y no crea el cliente', async () => {
    const { servicio, fabrica } = montar({});
    expect(servicio.configurado).toBe(false);
    await expect(servicio.responder('hola')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fabrica).not.toHaveBeenCalled();
  });

  it('usa la clave del entorno, sin reintentos, con plazo y el modelo por defecto', async () => {
    const { servicio, fabrica, create } = montar({ OPENAI_API_KEY: ' sk-sintetica ' });
    await expect(servicio.responder('hola', 'Sé breve')).resolves.toBe('Hola');
    expect(fabrica).toHaveBeenCalledWith({ apiKey: 'sk-sintetica', timeout: PLAZO_OPENAI_MS, maxRetries: 0 });
    expect(create).toHaveBeenCalledWith({ model: MODELO_OPENAI_POR_DEFECTO, input: 'hola', instructions: 'Sé breve' });
  });

  it('respeta OPENAI_MODEL y reutiliza el cliente', async () => {
    const { servicio, fabrica, create } = montar({ OPENAI_API_KEY: 'sk-sintetica', OPENAI_MODEL: 'modelo-x' });
    await servicio.responder('a');
    await servicio.responder('b');
    expect(fabrica).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenLastCalledWith({ model: 'modelo-x', input: 'b' });
  });

  it('no propaga el error del proveedor', async () => {
    const create = vi.fn().mockRejectedValue(new Error('401 detalle interno sk-sintetica'));
    const { servicio } = montar({ OPENAI_API_KEY: 'sk-sintetica' }, create);
    const error = await servicio.responder('hola').catch(e => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(String(error.message)).not.toContain('sk-sintetica');
  });

  it('avisa al arrancar en producción solo si falta la clave', () => {
    expect(validarConfiguracionOpenAI({ NODE_ENV: 'production' })).toHaveLength(1);
    expect(validarConfiguracionOpenAI({ NODE_ENV: 'production', OPENAI_API_KEY: 'sk-sintetica' })).toEqual([]);
    expect(validarConfiguracionOpenAI({ NODE_ENV: 'development' })).toEqual([]);
  });
});
