import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import { ChannelImportCandidate } from '../auto-manage/channel-import-candidate.entity';
import { Channel } from '../channels/channel.entity';
import { ChannelsModule } from '../channels/channels.module';
import { ChannelEvent } from './channel-event.entity';
import { ChannelPost } from './channel-post.entity';
import { ChannelScore } from './channel-score.entity';
import { ChannelSnapshot } from './channel-snapshot.entity';
import { AutoExposeService } from './auto-expose.service';
import { ChannelCategoryService } from './channel-category.service';
import { ChannelCollectorService } from './channel-collector.service';
import { MtprotoCollectorService } from './mtproto-collector.service';
import { ChannelDiscoveryService } from './channel-discovery.service';
import { ChannelLanguageService } from './channel-language.service';
import { ChannelMetricsService } from './channel-metrics.service';
import { DiscoveredUsername } from './discovered-username.entity';
import { InternalCronGuard } from './internal-cron.guard';
import { InternalStatsController } from './internal-stats.controller';
import { PublicChannelStatsController } from './public-channel-stats.controller';
import { PublicStatsController } from './public-stats.controller';
import { PublicStatsService } from './public-stats.service';
import { StatsJobService } from './stats-job.service';
import { StatsService } from './stats.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ChannelsModule,
    TypeOrmModule.forFeature([
      Channel,
      ChannelSnapshot,
      ChannelPost,
      ChannelScore,
      ChannelEvent,
      ChannelImportCandidate,
      DiscoveredUsername,
    ]),
  ],
  controllers: [
    InternalStatsController,
    PublicChannelStatsController,
    PublicStatsController,
  ],
  providers: [
    StatsService,
    ChannelCollectorService,
    MtprotoCollectorService,
    ChannelDiscoveryService,
    ChannelLanguageService,
    CategoryAiService,
    ChannelCategoryService,
    AutoExposeService,
    ChannelMetricsService,
    StatsJobService,
    InternalCronGuard,
    PublicStatsService,
  ],
  exports: [
    StatsService,
    ChannelCollectorService,
    ChannelMetricsService,
    StatsJobService,
    PublicStatsService,
    AutoExposeService,
    ChannelCategoryService,
  ],
})
export class StatsModule {}
