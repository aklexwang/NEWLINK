import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { kstDay } from '../security/detail-quota.logic';
import { Visitor } from './visitor.entity';

export const VISITOR_RETENTION_DAYS = 90;

export type VisitorInfo = {
  id: number;
  firstName: string | null;
  username: string | null;
  languageCode?: string | null;
  isPremium?: boolean;
};

/** 미니앱 방문자 기록: 사람마다 하루 한 번만 DB 에 쓴다 (서버 메모리로 거름) */
@Injectable()
export class VisitorService {
  private readonly logger = new Logger(VisitorService.name);
  private day = '';
  private readonly seenToday = new Set<number>();

  constructor(
    @InjectRepository(Visitor)
    private readonly repo: Repository<Visitor>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /** 문지기에서 서명 확인된 요청마다 부른다. 실패해도 요청에는 영향 없음 */
  noteVisit(info: VisitorInfo): void {
    const today = kstDay();
    if (today !== this.day) {
      this.day = today;
      this.seenToday.clear();
    }
    if (this.seenToday.has(info.id)) return;
    this.seenToday.add(info.id);
    void this.upsert(info, today).catch((error: unknown) => {
      this.seenToday.delete(info.id);
      this.logger.warn(
        `방문 기록 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async upsert(info: VisitorInfo, today: string) {
    const now = new Date();
    const clip = (v: string | null | undefined, n: number) =>
      v ? v.slice(0, n) : null;
    const row = await this.repo.findOneBy({ telegramId: info.id });
    if (!row) {
      await this.repo.insert({
        telegramId: info.id,
        firstName: clip(info.firstName, 100),
        username: clip(info.username, 100),
        languageCode: clip(info.languageCode, 10),
        isPremium: Boolean(info.isPremium),
        firstSeenAt: now,
        lastSeenAt: now,
        visitDays: 1,
        lastDay: today,
      });
      return;
    }
    await this.repo.update(
      { telegramId: info.id },
      {
        firstName: clip(info.firstName, 100) ?? row.firstName,
        username: clip(info.username, 100),
        languageCode: clip(info.languageCode, 10) ?? row.languageCode,
        isPremium: Boolean(info.isPremium),
        lastSeenAt: now,
        visitDays: row.lastDay === today ? row.visitDays : row.visitDays + 1,
        lastDay: today,
      },
    );
  }

  /** 어드민: 최근 방문자 (회원 여부 표시), 오늘·7일·전체 수 */
  async list(limit = 300) {
    const rows = await this.repo.find({
      order: { lastSeenAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 1000),
    });
    const ids = rows.map((r) => r.telegramId);
    const members = ids.length
      ? await this.users.find({
          where: { telegramId: In(ids) },
          select: ['telegramId', 'isRegistered', 'isBlocked'],
        })
      : [];
    const memberMap = new Map(members.map((m) => [Number(m.telegramId), m]));
    const today = kstDay();
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [total, last7d, todayCount] = await Promise.all([
      this.repo.count(),
      this.repo.count({ where: { lastSeenAt: MoreThanOrEqual(since7) } }),
      this.repo.count({ where: { lastDay: today } }),
    ]);
    return {
      total,
      last7d,
      today: todayCount,
      items: rows.map((r) => {
        const m = memberMap.get(Number(r.telegramId));
        return {
          telegramId: r.telegramId,
          firstName: r.firstName,
          username: r.username,
          languageCode: r.languageCode,
          isPremium: r.isPremium,
          firstSeenAt: r.firstSeenAt,
          lastSeenAt: r.lastSeenAt,
          visitDays: r.visitDays,
          isMember: Boolean(m?.isRegistered),
          isBlocked: Boolean(m?.isBlocked),
        };
      }),
    };
  }

  /** 마지막 방문 후 90일 지난 방문자 기록 삭제 */
  @Cron('45 4 * * *', { timeZone: 'Asia/Seoul' })
  async prune(): Promise<number> {
    const cutoff = new Date(
      Date.now() - VISITOR_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = await this.repo.delete({ lastSeenAt: LessThan(cutoff) });
    const n = result.affected ?? 0;
    if (n > 0) this.logger.log(`90일 지난 방문자 기록 ${n}건 삭제`);
    return n;
  }
}
