import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AdminNotification } from './admin-notification.entity';

export type NewAdminNotification = {
  key: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
};

@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(
    @InjectRepository(AdminNotification)
    private readonly repository: Repository<AdminNotification>,
  ) {}

  /** 같은 key 가 이미 있으면 만들지 않는다. 만들었으면 true */
  async notifyOnce(input: NewAdminNotification): Promise<boolean> {
    const key = input.key.slice(0, 120);
    if (await this.repository.exist({ where: { key } })) return false;
    try {
      await this.repository.insert({
        id: randomUUID(),
        key,
        type: input.type.slice(0, 40),
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 500) ?? null,
        link: input.link?.slice(0, 200) ?? null,
        readAt: null,
      });
      return true;
    } catch (error) {
      // 동시에 같은 key 가 들어온 경우(유니크 충돌)는 무시
      this.logger.debug(
        `알림 만들기 건너뜀: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  async list(limit = 30) {
    const [items, unread] = await Promise.all([
      this.repository.find({
        order: { createdAt: 'DESC' },
        take: Math.min(100, Math.max(1, limit)),
      }),
      this.repository.count({ where: { readAt: IsNull() } }),
    ]);
    return { unread, items };
  }

  async markRead(id: string): Promise<void> {
    await this.repository.update(
      { id, readAt: IsNull() },
      { readAt: new Date() },
    );
  }

  async markAllRead(): Promise<void> {
    await this.repository.update({ readAt: IsNull() }, { readAt: new Date() });
  }
}
