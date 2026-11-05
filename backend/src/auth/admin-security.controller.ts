import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminOtpService } from './admin-otp.service';
import { TelegramAdminGuard } from './telegram-admin.guard';
import { TelegramAuthGuard } from './telegram-auth.guard';

/** 어드민 [보안 설정]: Google OTP 등록·끄기 */
@Controller('admin/security')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminSecurityController {
  constructor(private readonly otp: AdminOtpService) {}

  @Get('otp')
  status() {
    return this.otp.status();
  }

  @Post('otp/setup')
  @HttpCode(HttpStatus.OK)
  setup(@Req() req: Request) {
    const user = (
      req as Request & { user?: { sub?: string; username?: string } }
    ).user;
    return this.otp.startSetup(user?.sub ?? user?.username ?? 'admin');
  }

  @Post('otp/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Body() body: { code?: unknown }) {
    return this.otp.confirmSetup(
      typeof body?.code === 'string' ? body.code : '',
    );
  }

  @Post('otp/disable')
  @HttpCode(HttpStatus.OK)
  async disable(@Body() body: { code?: unknown }) {
    const ok = await this.otp.disable(
      typeof body?.code === 'string' ? body.code : '',
    );
    return { ok };
  }
}
