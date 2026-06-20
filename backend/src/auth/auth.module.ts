import { Global, Module } from '@nestjs/common';
import { TelegramAdminGuard } from './telegram-admin.guard';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { TelegramAuthService } from './telegram-auth.service';

@Global()
@Module({
  providers: [TelegramAuthService, TelegramAuthGuard, TelegramAdminGuard],
  exports: [TelegramAuthService, TelegramAuthGuard, TelegramAdminGuard],
})
export class AuthModule {}
