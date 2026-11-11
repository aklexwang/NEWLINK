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
import { AdminLoginService } from './admin-login.service';
import { TelegramAdminGuard } from './telegram-admin.guard';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { miniAppGateCounters } from '../security/miniapp-gate.logic';
import { classifySample } from '../security/security-monitor.logic';

/** 어드민 [보안 설정]: Google OTP 등록·끄기 */
@Controller('admin/security')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminSecurityController {
  constructor(
    private readonly otp: AdminOtpService,
    private readonly login: AdminLoginService,
  ) {}

  @Get('otp')
  status() {
    return this.otp.status();
  }

  /** 우릴 스캔·공격·침입하려는 시도 모니터링. 서버가 켜진 뒤부터 센 값. */
  @Get('monitor')
  monitor() {
    const c = miniAppGateCounters;
    const samples = (c.unsignedSamples ?? []).map((s) => ({
      at: s.at,
      path: s.path,
      client: s.client,
      kind: classifySample(s.path),
    }));
    const loginFailures = this.login.getFailedAttempts();
    return {
      // 미니앱 밖(브라우저·봇·스크래퍼)에서 온 요청 = 우리 API 를 긁으려는 시도
      signedOk: c.signed,
      adminOk: c.admin,
      outsideBlocked: c.unsigned + c.blocked,
      rateLimited: c.rateLimited,
      scanCount: samples.filter((s) => s.kind === 'scan').length,
      injectionCount: samples.filter((s) => s.kind === 'injection').length,
      samples: samples.slice(0, 50),
      loginFailures,
      loginFailureTotal: loginFailures.reduce((n, a) => n + a.failures, 0),
    };
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
