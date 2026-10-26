import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AnalyticsRetentionService } from './analytics-retention.service';

/** 부팅 직후 한 번 돌리기까지 기다리는 시간 */
const BOOT_DELAY_MS = 2 * 60 * 1000;

/**
 * 정리 실행 시점: 매일 05:20(KST) 와 부팅 2분 뒤.
 * (기존 통계 크론 03:00 / 월요일 04:00 과 겹치지 않는다.)
 */
@Injectable()
export class AnalyticsRetentionScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private bootTimer: NodeJS.Timeout | null = null;

  constructor(private readonly retention: AnalyticsRetentionService) {}

  onModuleInit(): void {
    this.bootTimer = setTimeout(() => {
      void this.retention.runOnce();
    }, BOOT_DELAY_MS);
    this.bootTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
  }

  @Cron('20 5 * * *', { timeZone: 'Asia/Seoul' })
  async handleCron(): Promise<void> {
    await this.retention.runOnce();
  }
}
