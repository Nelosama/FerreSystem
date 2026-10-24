import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getJwtSecret } from './jwt-secret';
import { AUTH_CONFIG_CHECK, validarConfiguracionAuth } from './config-auth';
import { AuthService } from './auth.service';
import { GuiaController } from './guia.controller';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RecoveryController } from './recovery.controller';
import { RecoveryService } from './recovery.service';
import { RecoveryMailService } from './recovery-mail.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: getJwtSecret(configService),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController, GuiaController, RecoveryController],
  providers: [
    AuthService, JwtStrategy, RecoveryService, RecoveryMailService,
    // Se evalúa al arrancar: en producción, una configuración incompleta impide iniciar el servicio.
    { provide: AUTH_CONFIG_CHECK, inject: [ConfigService], useFactory: (configService: ConfigService) => { validarConfiguracionAuth(configService); return true; } },
  ],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
