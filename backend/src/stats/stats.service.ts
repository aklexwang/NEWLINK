import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Channel } from '../channels/channel.entity';
import { extractTelegramUsernameFromLink } from '../channels/telegram-username';

@Injectable()
export class StatsService implements OnModuleInit {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
  ) {}

  async onModuleInit() {
    try {
      await this.backfillUsernamesFromLinks();
    } catch (error) {
      this.logger.error(
        '채널 username 백필 실패(서버는 계속 기동)',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /** link의 t.me/아이디를 username에 한 번 채웁니다. 초대링크는 건너뜁니다. */
  async backfillUsernamesFromLinks(): Promise<number> {
    const channels = await this.channelRepository.find({
      where: { username: IsNull() },
      select: ['id', 'link', 'username'],
    });

    let updated = 0;
    for (const channel of channels) {
      const username = extractTelegramUsernameFromLink(channel.link);
      if (!username) continue;
      await this.channelRepository.update(channel.id, { username });
      updated += 1;
    }

    if (updated > 0) {
      this.logger.log(`채널 username ${updated}건을 link에서 채웠습니다.`);
    }
    return updated;
  }
}
