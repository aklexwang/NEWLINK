import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesModule } from '../categories/categories.module';
import { ChannelsModule } from '../channels/channels.module';
import { RankingModule } from '../ranking/ranking.module';
import { StatsModule } from '../stats/stats.module';
import { AutoManageService } from './auto-manage.service';
import { ChannelImportCandidate } from './channel-import-candidate.entity';
import { GoogleCseService } from './google-cse.service';
import { SerperSearchService } from './serper-search.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChannelImportCandidate]),
    ChannelsModule,
    CategoriesModule,
    RankingModule,
    StatsModule,
  ],
  providers: [
    AutoManageService,
    GoogleCseService,
    SerperSearchService,
  ],
})
export class AutoManageModule {}
