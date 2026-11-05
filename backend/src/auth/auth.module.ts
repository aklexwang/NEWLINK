import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from '../ads/app-setting.entity';
import { AdminOtpService } from './admin-otp.service';
import { AdminSecurityController } from './admin-security.controller';
import { UsersModule } from '../users/users.module';
import { AdminLoginService } from './admin-login.service';
import { AuthController } from './auth.controller';
import { JwtAuthService } from './jwt-auth.service';
import { TelegramAdminGuard } from './telegram-admin.guard';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { TelegramAuthService } from './telegram-auth.service';

@Global()
@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([AppSetting]),
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
  controllers: [AuthController, AdminSecurityController],
  providers: [
    TelegramAuthService,
    JwtAuthService,
    AdminLoginService,
    AdminOtpService,
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
