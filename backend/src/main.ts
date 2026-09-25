import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParserImport from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

const cookieParser = (cookieParserImport as any).default || cookieParserImport;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parse cookies for httpOnly refresh tokens
  app.use(cookieParser());

  // Enable CORS with credentials for frontend dev server
  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe
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
  await app.listen(port);
  console.log(`\n=================================================`);
  console.log(`🚀 FerreSystem Backend API corriendo en puerto ${port}`);
  console.log(`   Rutas base: http://localhost:${port}/api`);
  console.log(`=================================================\n`);
}

bootstrap();
