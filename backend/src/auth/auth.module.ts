import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { JwtAuthService } from './jwt-auth.service';
import { TelegramAdminGuard } from './telegram-admin.guard';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { TelegramAuthService } from './telegram-auth.service';

@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '30d',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    TelegramAuthService,
    JwtAuthService,
    TelegramAuthGuard,
    TelegramAdminGuard,
  ],
  exports: [
    TelegramAuthService,
    JwtAuthService,
    TelegramAuthGuard,
    TelegramAdminGuard,
  ],
})
export class AuthModule {}
