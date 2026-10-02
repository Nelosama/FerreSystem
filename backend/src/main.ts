import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParserImport from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';

const cookieParser = (cookieParserImport as any).default || cookieParserImport;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parse cookies for httpOnly refresh tokens
  app.use(cookieParser());

  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];

  // Enable CORS with credentials for frontend applications (Vercel, local dev, custom domain)
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        // Allow origin for production cross-domain deployment flexibility
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

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
