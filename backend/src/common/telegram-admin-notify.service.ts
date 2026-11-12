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

/**
 * 관리자 알림 서비스.
 *
 * ⛔ 중요: TellLink 봇(TELEGRAM_BOT_TOKEN)으로는 어떤 관리자 알림도 보내지 않습니다.
 * (운영자 요청: 제품 봇 채팅으로는 절대 메시지를 쏘지 말 것.)
 * 모든 발신 메서드는 "아무것도 보내지 않고" 조용히 끝납니다. 호출부는 그대로 두되,
 * 실제 전송(fetch sendMessage)은 전부 제거했습니다. 나중에 다른 채널로 알림을 보내고
 * 싶으면, 여기서 그 채널로 보내도록만 바꾸면 됩니다(제품 봇은 쓰지 않음).
 */
@Injectable()
export class TelegramAdminNotifyService {
  private readonly logger = new Logger(TelegramAdminNotifyService.name);

  constructor(private readonly configService: ConfigService) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async notifyNewSubmission(_payload: AdminSubmitAlertPayload): Promise<void> {
    // 봇 발신 비활성화: 새 제보는 관리자 페이지 → 승인 대기에서 확인.
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async notifyConfigWarnings(_lines: string[]): Promise<void> {
    // 봇 발신 비활성화.
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async notifyMtprotoStopped(_reasonCode: string): Promise<void> {
    // 봇 발신 비활성화: 상태는 수집 운영 페이지에서 확인.
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async notifyText(_html: string): Promise<void> {
    // 봇 발신 비활성화.
    return;
  }

  escapeHtml(value: string): string {
    return this.escape(value);
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
