import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { ChannelsModule } from '../channels/channels.module';
import { StatsModule } from '../stats/stats.module';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';
import { TelegramRankingService } from './telegram-ranking.service';
import { TgstatService } from './tgstat.service';

@Module({
  imports: [ChannelsModule, CategoriesModule, StatsModule],
  controllers: [RankingController],
  providers: [RankingService, TelegramRankingService, TgstatService],
  exports: [RankingService, TelegramRankingService, TgstatService],
})
export class RankingModule {}
