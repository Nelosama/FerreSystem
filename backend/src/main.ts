import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParserImport from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { createFrontendCorsOptions } from './common/frontend-cors';
import { leerTrustProxy, validarConfiguracionAuth } from './auth/auth-config';

const cookieParser = (cookieParserImport as any).default || cookieParserImport;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Falla al arrancar si la configuración de autenticación es inválida.
  validarConfiguracionAuth(process.env);
  // Detrás de un proxy (Render), req.ip solo es el cliente real si el número de proxies confiables está configurado.
  const trustProxy = leerTrustProxy(process.env.TRUST_PROXY);
  if (trustProxy) app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);

  // Parse cookies for httpOnly refresh tokens
  app.use(cookieParser());

  // Enable CORS with credentials for frontend applications (Vercel, local dev, custom domain)
  app.enableCors(createFrontendCorsOptions());

  // Global validation pipe with whitelist stripping
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

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
