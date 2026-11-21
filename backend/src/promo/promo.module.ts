import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from '../ads/app-setting.entity';
import { CategoryEntity } from '../categories/category.entity';
import { Channel } from '../channels/channel.entity';
import { StatsModule } from '../stats/stats.module';
import { PromoController } from './promo.controller';
import { PromoCreative } from './promo-creative.entity';
import { PromoPostLog } from './promo-post-log.entity';
import { PromoTarget } from './promo-target.entity';
import { PromoTelegramService } from './promo-telegram.service';
import { PromoService } from './promo.service';

/** 홍보 자동화(홍보 전용 텔레그램 계정 · 수집 계정과 분리) */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PromoTarget,
      PromoCreative,
      PromoPostLog,
      AppSetting,
      Channel,
      CategoryEntity,
    ]),
    StatsModule,
  ],
  controllers: [PromoController],
  providers: [PromoService, PromoTelegramService],
})
export class PromoModule {}
