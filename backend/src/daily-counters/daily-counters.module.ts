import { Global, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from '../ads/app-setting.entity';
import { getTmeGate, type TmeGateDaily } from '../stats/tme-gate';
import { DailyCounterStore } from './daily-counter-store.service';

const TME_GATE_KEY = 'tme-gate';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  providers: [DailyCounterStore],
  exports: [DailyCounterStore],
})
export class DailyCountersModule implements OnModuleInit {
  constructor(private readonly store: DailyCounterStore) {}

  /** t.me / 봇 429 횟수와 오늘 잠금은 전역 게이트라 여기서 되살리고 연결한다 */
  async onModuleInit(): Promise<void> {
    const gate = getTmeGate();
    const saved = await this.store.load<TmeGateDaily>(TME_GATE_KEY);
    if (saved) gate.restoreDaily(saved);
    gate.setDailyListener(() =>
      this.store.schedule(TME_GATE_KEY, () => gate.exportDaily()),
    );
  }
}
