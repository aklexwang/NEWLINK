import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelStatus } from './channel.entity';
import { ChannelEvent } from '../stats/channel-event.entity';
import {
  decideVerifiedRecheck,
  isOurBotAdministrator,
  isRequesterChannelAdmin,
  normalizeBotUsername,
  parseBotUserIdFromToken,
  type RecheckFetchResult,
  type TelegramChatAdministrator,
} from './channel-verify.logic';
import { extractTelegramUsernameFromLink } from './telegram-username';

const DEFAULT_BOT_USERNAME = 'newlinkcom_bot';

const RECHECK_GAP_MS = 1000;

@Injectable()
export class ChannelVerifyService {
  private readonly logger = new Logger(ChannelVerifyService.name);

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelEvent)
    private readonly eventRepository: Repository<ChannelEvent>,
    private readonly config: ConfigService,
  ) {}

  async verifyOwner(channelId: string, telegramUserId: number) {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
    });
    if (!channel || channel.status !== ChannelStatus.ACTIVE) {
      throw new NotFoundException('채널을 찾을 수 없습니다.');
    }

    const token = (this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
    if (!token || token.includes('placeholder')) {
      throw new ServiceUnavailableException(
        '봇 토큰이 없어 인증을 진행할 수 없습니다.',
      );
    }

    const botUsername =
      normalizeBotUsername(this.config.get<string>('TELEGRAM_BOT_USERNAME')) ||
      DEFAULT_BOT_USERNAME;
    const chatId = this.resolveChatId(channel);
    if (!chatId) {
      throw new BadRequestException(
        '공개 아이디가 없어 인증할 수 없습니다. 공개 채널/그룹만 운영자 인증이 가능합니다.',
      );
    }

    const fetched = await this.fetchAdministratorsResult(token, chatId);
    const admins = this.requireAdminList(fetched);
    const botId = parseBotUserIdFromToken(token);

    if (!isOurBotAdministrator(admins, botId, botUsername)) {
      throw new BadRequestException(
        `@${botUsername} 봇이 이 채널의 관리자가 아닙니다. 봇을 관리자로 추가한 뒤 다시 확인해 주세요.`,
      );
    }

    if (!isRequesterChannelAdmin(admins, telegramUserId)) {
      throw new ForbiddenException(
        '회원님이 이 채널의 관리자(소유자 또는 관리자)가 아닙니다. 익명 관리자 표시를 끈 뒤 다시 시도해 주세요.',
      );
    }

    channel.isVerified = true;
    channel.verifiedAt = new Date();
    channel.verifiedOwnerTelegramId = telegramUserId;
    await this.channelRepository.save(channel);

    return {
      id: channel.id,
      isVerified: true,
      verifiedAt: channel.verifiedAt.toISOString(),
    };
  }

  private resolveChatId(channel: Channel): string | null {
    if (channel.telegramChatId != null) {
      return String(channel.telegramChatId);
    }
    const username =
      channel.username?.replace(/^@/, '').trim() ||
      extractTelegramUsernameFromLink(channel.link);
    return username ? `@${username}` : null;
  }

  /** 수집 작업 후 인증 채널을 다시 확인합니다. */
  async recheckVerifiedChannels(): Promise<{
    checked: number;
    unverified: number;
    retried: number;
  }> {
    const token = (this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
    if (!token || token.includes('placeholder')) {
      this.logger.warn('봇 토큰이 없어 인증 재확인을 건너뜁니다.');
      return { checked: 0, unverified: 0, retried: 0 };
    }

    const botUsername =
      normalizeBotUsername(this.config.get<string>('TELEGRAM_BOT_USERNAME')) ||
      DEFAULT_BOT_USERNAME;
    const botId = parseBotUserIdFromToken(token);
    const channels = await this.channelRepository.find({
      where: { isVerified: true, status: ChannelStatus.ACTIVE },
    });

    let unverified = 0;
    let retried = 0;
    for (let i = 0; i < channels.length; i += 1) {
      const channel = channels[i];
      const decision = await this.recheckOne(
        channel,
        token,
        botId,
        botUsername,
      );
      if (decision === 'unverify') unverified += 1;
      if (decision === 'retry') retried += 1;
      if (i < channels.length - 1) {
        await sleep(RECHECK_GAP_MS);
      }
    }

    this.logger.log(
      `인증 재확인 ${channels.length}건 · 해제 ${unverified}건 · 다음날 재시도 ${retried}건`,
    );
    return { checked: channels.length, unverified, retried };
  }

  private async recheckOne(
    channel: Channel,
    token: string,
    botId: number | null,
    botUsername: string,
  ) {
    const chatId = this.resolveChatId(channel);
    if (!chatId) {
      this.logger.warn(`인증 재확인 건너뜀(공개 아이디 없음): ${channel.id}`);
      return 'retry' as const;
    }

    const fetched = await this.fetchAdministratorsResult(token, chatId);
    const decision = decideVerifiedRecheck(fetched, {
      botId,
      botUsername,
      ownerTelegramId: channel.verifiedOwnerTelegramId,
    });

    if (decision !== 'unverify') return decision;

    channel.isVerified = false;
    await this.channelRepository.save(channel);
    await this.eventRepository.save({
      channelId: channel.id,
      type: 'unverified',
      before: 'verified',
      after: 'unverified',
      occurredAt: new Date(),
    });
    this.logger.log(`운영자 인증을 해제했습니다: ${channel.id}`);
    return decision;
  }

  private requireAdminList(
    fetched: RecheckFetchResult,
  ): TelegramChatAdministrator[] {
    if (fetched.kind === 'network') {
      throw new ServiceUnavailableException(
        '텔레그램 봇 API에 연결하지 못했습니다.',
      );
    }
    const data = fetched.body;
    if (!data.ok || !Array.isArray(data.result)) {
      const description = (data.description ?? '').toLowerCase();
      if (
        description.includes('chat not found') ||
        description.includes('not found')
      ) {
        throw new NotFoundException('텔레그램에서 채널을 찾지 못했습니다.');
      }
      if (
        description.includes('administrator') ||
        description.includes('not enough rights') ||
        description.includes('bot is not a member') ||
        description.includes('kicked')
      ) {
        throw new BadRequestException(
          '봇이 채널 관리자가 아니거나 권한이 부족합니다. @newlinkcom_bot 을 관리자로 추가해 주세요.',
        );
      }
      throw new BadRequestException(
        data.description || '관리자 목록을 불러오지 못했습니다.',
      );
    }
    return data.result;
  }

  private async fetchAdministratorsResult(
    token: string,
    chatId: string,
  ): Promise<RecheckFetchResult> {
    const url = new URL(
      `https://api.telegram.org/bot${token}/getChatAdministrators`,
    );
    url.searchParams.set('chat_id', chatId);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      const body = (await res.json()) as {
        ok?: boolean;
        description?: string;
        error_code?: number;
        result?: TelegramChatAdministrator[];
      };
      return { kind: 'http', status: res.status, body };
    } catch {
      return { kind: 'network' };
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
