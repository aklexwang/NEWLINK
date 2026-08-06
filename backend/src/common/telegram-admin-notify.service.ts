import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AdminSubmitAlertPayload = {
  title: string;
  link: string;
  linkType: string;
  category: string;
  submittedBy: number;
  reporterLabel?: string | null;
};

@Injectable()
export class TelegramAdminNotifyService {
  private readonly logger = new Logger(TelegramAdminNotifyService.name);

  constructor(private readonly configService: ConfigService) {}

  async notifyNewSubmission(payload: AdminSubmitAlertPayload): Promise<void> {
    const token = (this.configService.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
    if (!token || token.includes('placeholder') || token.includes('your_bot')) {
      return;
    }

    const adminIds = (this.configService.get<string>('TELEGRAM_ADMIN_IDS') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (adminIds.length === 0) return;

    const typeLabel = payload.linkType === 'group' ? '그룹' : '채널';
    const reporter = payload.reporterLabel?.trim() || `ID ${payload.submittedBy}`;
    const text = [
      '🆕 <b>새 제보 · 승인 대기</b>',
      '',
      `<b>${this.escape(payload.title)}</b>`,
      `유형: ${typeLabel}`,
      `카테고리: ${this.escape(payload.category || '-')}`,
      `제보자: ${this.escape(reporter)}`,
      `링크: ${this.escape(payload.link)}`,
      '',
      '관리자 페이지 → 승인 대기에서 확인하세요.',
    ].join('\n');

    await Promise.all(
      adminIds.map(async (chatId) => {
        try {
          const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            }),
          });
          if (!res.ok) {
            const body = await res.text();
            this.logger.warn(`admin notify failed (${chatId}): ${res.status} ${body}`);
          }
        } catch (error) {
          this.logger.warn(
            `admin notify error (${chatId}): ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
