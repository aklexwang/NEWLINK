import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/channel.entity';
import { ANALYTICS_ENTITIES } from './analytics.entities';
import { AnalyticsRetentionScheduler } from './analytics-retention.scheduler';
import { AnalyticsRetentionService } from './analytics-retention.service';
import { OpenStatsService } from './open-stats.service';
import { RequestActorService } from './request-actor.service';
import { SearchInsightsService } from './search-insights.service';
import { SearchLogService } from './search-log.service';
import { SearchTermsService } from './search-terms.service';
import { TelegramOpenController } from './telegram-open.controller';
import { TelegramOpenService } from './telegram-open.service';

/**
 * 검색 금지어·검색 기록·텔레그램 이동 기록.
 * ChannelsModule / AdminModule 이 이 모듈을 가져다 쓴다(이 모듈은 둘을 가져오지 않는다).
 * AuthModule 은 전역이라 JwtAuthService / TelegramAuthService 를 바로 주입할 수 있다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([...ANALYTICS_ENTITIES, Channel])],
  controllers: [TelegramOpenController],
  providers: [
    RequestActorService,
    SearchTermsService,
    SearchLogService,
    SearchInsightsService,
    TelegramOpenService,
    OpenStatsService,
    AnalyticsRetentionService,
    AnalyticsRetentionScheduler,
  ],
  exports: [
    SearchTermsService,
    SearchLogService,
    SearchInsightsService,
    OpenStatsService,
  ],
})
export class AnalyticsModule {}
