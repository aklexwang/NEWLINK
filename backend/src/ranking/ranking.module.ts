import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';
import { TelegramRankingService } from './telegram-ranking.service';
import { TgstatService } from './tgstat.service';

@Module({
  imports: [ChannelsModule],
  controllers: [RankingController],
  providers: [RankingService, TelegramRankingService, TgstatService],
})
export class RankingModule {}
