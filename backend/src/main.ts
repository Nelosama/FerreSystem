import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParserImport from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { createFrontendCorsOptions } from './common/frontend-cors';

const cookieParser = (cookieParserImport as any).default || cookieParserImport;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
