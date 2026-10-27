import { noStore } from './common/no-store.middleware';
import { crearCabecerasSeguridad } from './common/cabeceras-seguridad.middleware';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './app.module';
import * as cookieParserImport from 'cookie-parser';
import { configurarPipesGlobales } from './common/pipes/profundidad-maxima.pipe';
import { errorDeConfiguracionContingencia } from './contingencia/clave-operaciones';
import { createFrontendCorsOptions } from './common/frontend-cors';
import { leerTrustProxy, validarConfiguracionAuth } from './auth/auth-config';
import { validarConfiguracionCorreo } from './auth/recovery-mail.service';

const cookieParser = (cookieParserImport as any).default || cookieParserImport;

async function bootstrap() {
  // Configuración obligatoria de la contingencia: se valida antes de crear la aplicación y el mensaje nunca incluye valores secretos.
  const errorContingencia = errorDeConfiguracionContingencia(process.env);
  if (errorContingencia) {
    console.error(`[ARRANQUE] ${errorContingencia}`);
    process.exit(1);
  }
  // Analizador de cuerpo explícito: JSON admite hasta 2 MB para la importación masiva (5000 filas ≈ 1 MB);
  // el resto de rutas sigue igual que con el valor por defecto de Nest.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(crearCabecerasSeguridad());
  app.use(noStore);
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Falla al arrancar si la configuración de autenticación es inválida.
  validarConfiguracionAuth(process.env);
  // Correo de seguridad (Gmail SMTP): configuración parcial o mal escrita impide arrancar; los avisos no incluyen valores.
  for (const aviso of validarConfiguracionCorreo(process.env)) new Logger('Correo').warn(aviso);
  // Detrás de un proxy (Render), req.ip solo es el cliente real si el número de proxies confiables está configurado.
  const trustProxy = leerTrustProxy(process.env.TRUST_PROXY);
  if (trustProxy) app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);

  // Parse cookies for httpOnly refresh tokens
  app.use(cookieParser());

  // Enable CORS with credentials for frontend applications (Vercel, local dev, custom domain)
  app.enableCors(createFrontendCorsOptions());

  // Límite de profundidad del JSON y validación global con whitelist (ver profundidad-maxima.pipe.ts, H-P)
  configurarPipesGlobales(app);

  // Global prefix for API
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`\n=================================================`);
  console.log(`🚀 FerreSystem Backend API corriendo en puerto ${port}`);
  console.log(`   Rutas base: http://localhost:${port}/api`);
  console.log(`=================================================\n`);
}

void bootstrap();
