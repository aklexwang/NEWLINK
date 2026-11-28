import { Controller, Post, UseGuards } from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { AlertBotService } from './alert-bot.service';

/** 알림 봇 시험 보내기 */
@Controller('admin/alert')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AlertBotController {
  constructor(private readonly alert: AlertBotService) {}

  @Post('test')
  async test() {
    if (!this.alert.isConfigured())
      return { ok: false, message: 'ALERT_BOT_TOKEN 이 아직 없어요.' };
    const ok = await this.alert.send('✅ TellLink 알림 봇 연결 확인 메시지예요.');
    return {
      ok,
      message: ok
        ? '알림 봇으로 시험 메시지를 보냈어요.'
        : '못 보냈어요. @Kplay33 계정으로 알림 봇에 [시작]을 눌렀는지 확인해 주세요.',
    };
  }
}
