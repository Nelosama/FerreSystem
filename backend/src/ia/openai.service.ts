import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

// Cliente de OpenAI (ChatGPT) solo en el backend. La clave vive en OPENAI_API_KEY del entorno: nunca en el repositorio ni en el frontend.
// - Sin clave, el servicio queda desactivado y responde 503; no se intenta ninguna llamada.
// - Los errores no se reenvían ni se registran: pueden contener la respuesta del proveedor. Quien llama responde de forma genérica.

/** Modelo por defecto si OPENAI_MODEL no está definido. */
export const MODELO_OPENAI_POR_DEFECTO = 'gpt-4o-mini';
/** Plazo máximo por solicitud; el SDK no reintenta para no duplicar el tiempo de espera. */
export const PLAZO_OPENAI_MS = 20000;
/** Fábrica del cliente. Las pruebas inyectan un cliente simulado: nunca se llama a la API real. */
export const CLIENTE_OPENAI = 'CLIENTE_OPENAI';

export interface ClienteOpenAI {
  responses: { create(cuerpo: { model: string; input: string; instructions?: string }): Promise<{ output_text?: string }> };
}
export type FabricaClienteOpenAI = (opciones: { apiKey: string; timeout: number; maxRetries: number }) => ClienteOpenAI;

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');

/** Aviso de arranque sin valores: en producción se informa si la integración quedó desactivada. */
export function validarConfiguracionOpenAI(env: Record<string, string | undefined>): string[] {
  if (texto(env.OPENAI_API_KEY)) return [];
  return texto(env.NODE_ENV).toLowerCase() === 'production' ? ['OpenAI desactivado: falta OPENAI_API_KEY.'] : [];
}

@Injectable()
export class OpenAIService {
  private cliente?: ClienteOpenAI;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(CLIENTE_OPENAI) private readonly fabrica?: FabricaClienteOpenAI,
  ) {}

  get configurado(): boolean {
    return Boolean(texto(this.config.get('OPENAI_API_KEY')));
  }

  private obtenerCliente(): ClienteOpenAI {
    const apiKey = texto(this.config.get('OPENAI_API_KEY'));
    if (!apiKey) throw new ServiceUnavailableException('OpenAI no configurado');
    this.cliente ??= (this.fabrica ?? ((opciones) => new OpenAI(opciones) as unknown as ClienteOpenAI))({ apiKey, timeout: PLAZO_OPENAI_MS, maxRetries: 0 });
    return this.cliente;
  }

  /** Envía un mensaje y devuelve el texto de la respuesta. */
  async responder(mensaje: string, instrucciones?: string): Promise<string> {
    const cliente = this.obtenerCliente();
    const model = texto(this.config.get('OPENAI_MODEL')) || MODELO_OPENAI_POR_DEFECTO;
    try {
      const respuesta = await cliente.responses.create({ model, input: mensaje, ...(instrucciones ? { instructions: instrucciones } : {}) });
      return respuesta.output_text ?? '';
    } catch {
      // Nunca se propaga el error original: puede incluir la respuesta del proveedor o datos de la cuenta.
      throw new ServiceUnavailableException('OpenAI temporalmente no disponible');
    }
  }
}
