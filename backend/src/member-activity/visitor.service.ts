import { Injectable, Logger, Optional } from '@nestjs/common';
import { AlertBotService } from '../alert-bot/alert-bot.service';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { kstDay } from '../security/detail-quota.logic';
import { Visitor } from './visitor.entity';
import { VisitorDaily } from './visitor-daily.entity';

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
    @InjectRepository(VisitorDaily)
    private readonly daily: Repository<VisitorDaily>,
    @Optional() private readonly alert?: AlertBotService,
  ) {}

  /** 그날 방문자 수 +1 (처음 온 사람이면 신규도 +1) */
  private async bumpDaily(today: string, isNew: boolean) {
    const res = await this.daily
      .createQueryBuilder()
      .update(VisitorDaily)
      .set({
        visitors: () => 'visitors + 1',
        ...(isNew ? { newVisitors: () => 'new_visitors + 1' } : {}),
      })
      .where('day = :today', { today })
      .execute();
    if (!res.affected) {
      try {
        await this.daily.insert({
          day: today,
          visitors: 1,
          newVisitors: isNew ? 1 : 0,
        });
      } catch {
        // 같은 순간 다른 요청이 먼저 만들었으면 다시 더한다
        await this.daily.increment({ day: today }, 'visitors', 1);
        if (isNew) await this.daily.increment({ day: today }, 'newVisitors', 1);
      }
    }
  }

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
      await this.bumpDaily(today, true);
      this.alert?.noteNewVisitor({
        id: info.id,
        firstName: info.firstName,
        username: info.username,
      });
      return;
    }
    if (row.lastDay !== today) await this.bumpDaily(today, false);
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
          select: ['telegramId', 'isBlocked', 'isAdvertiser'],
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
          // 회원 = 텔레그램으로 로그인해 회원 목록(users)에 있는 사람 (지갑 등록 여부와 무관)
          isMember: Boolean(m),
          isAdvertiser: Boolean(m?.isAdvertiser),
          isBlocked: Boolean(m?.isBlocked),
        };
      }),
    };
  }

  /**
   * 어드민: 날짜별 방문자 (최근 n일).
   * 방문자 수는 이 기능을 켠 날부터 쌓이고, 신규 방문자는 90일 보관된 첫 방문일로도 채운다.
   */
  async dailyStats(days = 30) {
    const n = Math.min(Math.max(days, 1), 90);
    const list: string[] = [];
    for (let i = n - 1; i >= 0; i -= 1)
      list.push(kstDay(Date.now() - i * 86_400_000));
    const rows = await this.daily.find({ where: { day: In(list) } });
    const byDay = new Map(rows.map((r) => [r.day, r]));
    // 첫 방문일(90일 보관) → 날짜별 신규
    const since = new Date(Date.now() - n * 86_400_000);
    const firsts = await this.repo.find({
      select: ['firstSeenAt'],
      where: { firstSeenAt: MoreThanOrEqual(since) },
    });
    const newByDay = new Map<string, number>();
    for (const f of firsts) {
      const d = kstDay(new Date(f.firstSeenAt).getTime());
      newByDay.set(d, (newByDay.get(d) ?? 0) + 1);
    }
    const members = await this.users.find({
      select: ['createdAt'],
      where: { createdAt: MoreThanOrEqual(since) },
    });
    const signByDay = new Map<string, number>();
    for (const m of members) {
      const d = kstDay(new Date(m.createdAt).getTime());
      signByDay.set(d, (signByDay.get(d) ?? 0) + 1);
    }
    return list.map((day) => ({
      day,
      visitors: byDay.get(day)?.visitors ?? null,
      newVisitors: Math.max(
        byDay.get(day)?.newVisitors ?? 0,
        newByDay.get(day) ?? 0,
      ),
      signups: signByDay.get(day) ?? 0,
    }));
  }

  /** 밤 11시: 오늘 신규 방문자 · 재방문자 · 가입 요약을 알림 봇으로 */
  @Cron('0 23 * * *', { timeZone: 'Asia/Seoul' })
  async dailySummary(): Promise<void> {
    if (!this.alert?.isConfigured()) return;
    const [today] = (await this.dailyStats(1)).slice(-1);
    if (!today) return;
    const visitors = today.visitors ?? 0;
    const returning = Math.max(0, visitors - today.newVisitors);
    await this.alert.send(
      `📊 TellLink 오늘 요약 (${today.day})\n\n🆕 신규 방문자 ${today.newVisitors}명\n🔁 재방문자 ${returning}명\n✅ 가입 ${today.signups}명\n👀 전체 방문 ${visitors}명`,
    );
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
