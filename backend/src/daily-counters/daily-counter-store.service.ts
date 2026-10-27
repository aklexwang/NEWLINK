import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../ads/app-setting.entity';
import { formatKstYmd } from '../stats/channel-metrics.math';
import {
  dailyKey,
  decodeDailyForToday,
  encodeDaily,
} from './daily-counter.logic';

const SAVE_DELAY_MS = 3000;

/**
 * "오늘" 숫자(AI 분류 수, MTProto 요청 수, 429 횟수 등)를 app_settings 에 저장해
 * 서버를 다시 켜도 그날 숫자가 이어지게 한다. 저장은 몇 초 모아서 한 번.
 */
@Injectable()
export class DailyCounterStore implements OnModuleDestroy {
  private readonly logger = new Logger(DailyCounterStore.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly pending = new Map<
    string,
    () => { date: string; values: unknown }
  >();

  constructor(
    @InjectRepository(AppSetting)
    private readonly repo: Repository<AppSetting>,
  ) {}

  /** 저장된 값이 오늘 것이면 돌려준다 */
  async load<T>(name: string): Promise<T | null> {
    try {
      const row = await this.repo.findOne({ where: { key: dailyKey(name) } });
      return decodeDailyForToday<T>(row?.value, formatKstYmd());
    } catch (error) {
      this.logger.warn(`daily ${name} 불러오기 실패: ${String(error)}`);
      return null;
    }
  }

  /** 바뀐 뒤 몇 초 모아서 저장. read 는 저장 시점의 최신 값을 돌려주는 함수 */
  schedule(name: string, read: () => { date: string; values: unknown }): void {
    this.pending.set(name, read);
    if (this.timers.has(name)) return;
    const timer = setTimeout(() => {
      this.timers.delete(name);
      void this.flush(name);
    }, SAVE_DELAY_MS);
    timer.unref?.();
    this.timers.set(name, timer);
  }

  private async flush(name: string): Promise<void> {
    const read = this.pending.get(name);
    this.pending.delete(name);
    if (!read) return;
    try {
      const { date, values } = read();
      await this.repo.save({
        key: dailyKey(name),
        value: encodeDaily(date, values),
      });
    } catch (error) {
      this.logger.warn(`daily ${name} 저장 실패: ${String(error)}`);
    }
  }

  /** 종료 직전 남은 저장 마무리 */
  async onModuleDestroy(): Promise<void> {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.all([...this.pending.keys()].map((name) => this.flush(name)));
  }
}
