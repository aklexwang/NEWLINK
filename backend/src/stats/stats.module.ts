import { RankAd } from '../ads/rank-ad.entity';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import { CategoryEntity } from '../categories/category.entity';
import { ChannelImportCandidate } from '../auto-manage/channel-import-candidate.entity';
import { Channel } from '../channels/channel.entity';
import { ChannelsModule } from '../channels/channels.module';
import { ChannelEvent } from './channel-event.entity';
import { ChannelPost } from './channel-post.entity';
import { ChannelScore } from './channel-score.entity';
import { ChannelSnapshot } from './channel-snapshot.entity';
import { AutoExposeService } from './auto-expose.service';
import { ChannelCategoryService } from './channel-category.service';
import { CategoryProposal } from './category-proposal.entity';
import { CategoryReclassifyService } from './category-reclassify.service';
import { CategorySuggestionService } from './category-suggestion.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChannelCollectorService } from './channel-collector.service';
import { MtprotoCollectorService } from './mtproto-collector.service';
import { ChannelDiscoveryService } from './channel-discovery.service';
import { KeywordSearchService } from './keyword-search.service';
import { ChannelLanguageService } from './channel-language.service';
import { ChannelMetricsService } from './channel-metrics.service';
import { DiscoveryKeyword } from './discovery-keyword.entity';
import { DiscoveryKeywordService } from './discovery-keyword.service';
import { DiscoveredUsername } from './discovered-username.entity';
import { InternalCronGuard } from './internal-cron.guard';
import { InternalStatsController } from './internal-stats.controller';
import { PublicChannelStatsController } from './public-channel-stats.controller';
import { PublicStatsController } from './public-stats.controller';
import { PublicStatsService } from './public-stats.service';
import { StatsJobService } from './stats-job.service';
import { StatsRun } from './stats-run.entity';
import { MtprotoState } from './mtproto-state.entity';
import { StatsService } from './stats.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ChannelsModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Channel,
      ChannelSnapshot,
      ChannelPost,
      ChannelScore,
      ChannelEvent,
      ChannelImportCandidate,
      DiscoveredUsername,
      DiscoveryKeyword,
      StatsRun,
      MtprotoState,
      CategoryProposal,
      CategoryEntity,
      RankAd,
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
    DiscoveryKeywordService,
    KeywordSearchService,
    ChannelLanguageService,
    CategoryAiService,
    ChannelCategoryService,
    CategoryReclassifyService,
    CategorySuggestionService,
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
    CategoryReclassifyService,
    CategorySuggestionService,
    ChannelLanguageService,
    CategoryAiService,
    ChannelDiscoveryService,
  ],
})
export class StatsModule {}
