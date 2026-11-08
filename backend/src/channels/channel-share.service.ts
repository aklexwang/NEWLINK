import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from './channel.entity';
import { normalizeBotUsername } from './channel-verify.logic';

const DEFAULT_BOT_USERNAME = 'telllink_bot';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 공유 메시지: 채널 이름(누르면 텔링크의 이 채널 화면) + 회원 수. 버튼·안내 문구 없이 */
export function buildShareArticle(input: {
  channelId: string;
  title: string;
  memberCount: number | null;
  botUsername: string;
}) {
  const members = input.memberCount != null ? `회원 ${input.memberCount.toLocaleString('ko-KR')}명` : '';
  const appLink = `https://t.me/${input.botUsername}?startapp=c_${input.channelId}`;
  const titleLink = `<a href="${appLink}">${escapeHtml(input.title)}</a>`;
  return {
    type: 'article' as const,
    // Telegram 결과 ID: 1~64바이트
    id: `c${input.channelId.replace(/-/g, '').slice(0, 32)}`,
    title: input.title.slice(0, 120),
    ...(members ? { description: members } : {}),
    input_message_content: {
      message_text: members ? `${titleLink}\n${members}` : titleLink,
      parse_mode: 'HTML' as const,
      link_preview_options: { is_disabled: true },
    },
  };
}

/**
 * 채널 공유 (텔레그램 shareMessage 용):
 * 봇이 공유할 메시지를 미리 저장(savePreparedInlineMessage)하고 그 id 를 돌려준다.
 * 미니앱은 이 id 로 텔레그램 공식 공유 창을 띄운다 — 폴드 펼친 화면에서 공유 창이 미니앱 뒤에 뜨던 문제 대응.
 */
@Injectable()
export class ChannelShareService {
  private readonly logger = new Logger(ChannelShareService.name);

  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly config: ConfigService,
  ) {}

  async prepare(channelId: string, telegramUserId: number): Promise<{ id: string }> {
    const token = (this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
    if (!token || token.includes('placeholder')) {
      throw new ServiceUnavailableException('공유 준비를 할 수 없어요.');
    }
    const channel = await this.channels.findOne({
      where: { id: channelId },
      select: { id: true, title: true, memberCount: true },
    });
    if (!channel) throw new NotFoundException('채널을 찾을 수 없어요.');

    const botUsername =
      normalizeBotUsername(this.config.get<string>('TELEGRAM_BOT_USERNAME')) || DEFAULT_BOT_USERNAME;
    const result = buildShareArticle({
      channelId: channel.id,
      title: channel.title,
      memberCount: channel.memberCount,
      botUsername,
    });

    const res = await fetch(`https://api.telegram.org/bot${token}/savePreparedInlineMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: telegramUserId,
        result,
        allow_user_chats: true,
        allow_bot_chats: false,
        allow_group_chats: true,
        allow_channel_chats: true,
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as
      | { ok?: boolean; result?: { id?: string }; description?: string }
      | null;
    if (!body?.ok || !body.result?.id) {
      // 토큰이 섞일 수 있는 원문 대신 텔레그램 설명만 남긴다
      this.logger.warn(`공유 메시지 준비 실패: ${body?.description ?? res?.status ?? 'network'}`);
      throw new ServiceUnavailableException('공유 준비에 실패했어요.');
    }
    return { id: body.result.id };
  }
}
