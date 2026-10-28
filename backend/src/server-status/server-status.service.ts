import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as os from 'os';
import { AppSetting } from '../ads/app-setting.entity';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';
import { AdminNotificationService } from '../notifications/admin-notification.service';
import { formatKstYmd } from '../stats/channel-metrics.math';
import {
  dailyGrowthMb,
  daysUntilFull,
  decodeHistory,
  encodeHistory,
  levelOf,
  MB,
  parseLimitMb,
  percent,
  pushSizePoint,
  WARN_PERCENT,
} from './server-status.logic';

const HISTORY_KEY = 'serverstat:db-size';
const STARTED_AT = new Date();

/**
 * 서버 상황: DB 용량(요금제 한도 대비), 서버 메모리, 재시작 시각.
 * 한도는 Render 요금제 기준 (DB 1GB, 서버 512MB). 바뀌면 환경변수로 맞춘다.
 */
@Injectable()
export class ServerStatusService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ServerStatusService.name);

  constructor(
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
    private readonly notifications: AdminNotificationService,
    private readonly telegram: TelegramAdminNotifyService,
  ) {}

  private dbLimitMb() {
    return parseLimitMb(process.env.SERVER_DB_LIMIT_MB, 1024);
  }

  private memLimitMb() {
    return parseLimitMb(process.env.SERVER_MEMORY_LIMIT_MB, 512);
  }

  private isPostgres() {
    return String(this.settings.manager.connection.options.type) === 'postgres';
  }

  async status() {
    const dbLimitMb = this.dbLimitMb();
    let dbBytes = 0;
    let tables: Array<{ name: string; mb: number; rows: number }> = [];
    if (this.isPostgres()) {
      const size: Array<{ bytes: string }> = await this.settings.query(
        'SELECT pg_database_size(current_database())::bigint AS bytes',
      );
      dbBytes = Number(size[0]?.bytes ?? 0);
      const rows: Array<{ name: string; bytes: string; rows: string }> =
        await this.settings.query(
          `SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS bytes, GREATEST(c.reltuples, 0)::bigint AS rows
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'r' AND n.nspname = 'public'
          ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 10`,
        );
      tables = rows.map((r) => ({
        name: r.name,
        mb: Math.round((Number(r.bytes) / MB) * 10) / 10,
        rows: Number(r.rows),
      }));
    }
    const dbMb = Math.round((dbBytes / MB) * 10) / 10;
    const history = await this.recordSize(dbMb);
    const growth = dailyGrowthMb(history);
    const dbPct = percent(dbMb, dbLimitMb);

    const mem = process.memoryUsage();
    const memLimitMb = this.memLimitMb();
    const rssMb = Math.round((mem.rss / MB) * 10) / 10;
    const memPct = percent(rssMb, memLimitMb);

    return {
      checkedAt: new Date().toISOString(),
      db: {
        usedMb: dbMb,
        limitMb: dbLimitMb,
        percent: dbPct,
        level: levelOf(dbPct),
        growthMbPerDay: growth,
        daysUntilFull: daysUntilFull(dbMb, dbLimitMb, growth),
        tables,
        history,
      },
      memory: {
        usedMb: rssMb,
        heapMb: Math.round((mem.heapUsed / MB) * 10) / 10,
        limitMb: memLimitMb,
        percent: memPct,
        level: levelOf(memPct),
      },
      server: {
        startedAt: STARTED_AT.toISOString(),
        uptimeHours: Math.round((process.uptime() / 3600) * 10) / 10,
        node: process.version,
        load1m: Math.round(os.loadavg()[0] * 100) / 100,
      },
      plan: {
        web: process.env.SERVER_PLAN_WEB ?? 'Starter 0.5 CPU · 512MB',
        db: process.env.SERVER_PLAN_DB ?? 'Basic-256mb · 저장 1GB',
      },
    };
  }

  /** 오늘 DB 크기를 기록 (하루 한 점) */
  private async recordSize(mb: number) {
    if (!(mb > 0)) return [];
    const row = await this.settings.findOne({ where: { key: HISTORY_KEY } });
    const history = pushSizePoint(decodeHistory(row?.value), {
      d: formatKstYmd(),
      mb,
    });
    await this.settings.save({
      key: HISTORY_KEY,
      value: encodeHistory(history),
    });
    return history;
  }

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    setTimeout(
      () => void this.check().catch(() => undefined),
      120_000,
    ).unref?.();
  }

  /** 매일 10:30, 그리고 6시간마다 한도 확인 → 80% 넘으면 하루 한 번 알림 */
  @Cron('30 10,16,22,4 * * *', { timeZone: 'Asia/Seoul' })
  async handleCron() {
    await this.check();
  }

  async check(): Promise<void> {
    const s = await this.status();
    const day = formatKstYmd();
    const alerts: Array<{ key: string; title: string; body: string }> = [];
    if (s.db.percent >= WARN_PERCENT) {
      alerts.push({
        key: `server:db:${day}`,
        title: `💾 DB 용량 ${s.db.percent}% (${s.db.usedMb}MB / ${s.db.limitMb}MB)`,
        body:
          s.db.daysUntilFull != null
            ? `지금 속도면 약 ${s.db.daysUntilFull}일 뒤 가득 참. Render에서 DB 저장 용량을 늘려 주세요.`
            : 'Render에서 DB 저장 용량을 늘려 주세요.',
      });
    }
    if (s.memory.percent >= WARN_PERCENT) {
      alerts.push({
        key: `server:mem:${day}`,
        title: `🧠 서버 메모리 ${s.memory.percent}% (${s.memory.usedMb}MB / ${s.memory.limitMb}MB)`,
        body: '자주 넘으면 Render 서버 요금제를 한 단계 올려 주세요.',
      });
    }
    for (const a of alerts) {
      const made = await this.notifications.notifyOnce({
        key: a.key,
        type: 'server_status',
        title: a.title,
        body: a.body,
        link: '/admin/server',
      });
      if (!made) continue;
      const esc = (v: string) => this.telegram.escapeHtml(v);
      await this.telegram.notifyText(`<b>${esc(a.title)}</b>\n${esc(a.body)}`);
      this.logger.warn(a.title);
    }
  }
}
