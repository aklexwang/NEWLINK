import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesModule } from '../categories/categories.module';
import { ChannelsModule } from '../channels/channels.module';
import { RankingModule } from '../ranking/ranking.module';
import { AdminAutoManageController } from './admin-auto-manage.controller';
import { AutoManageService } from './auto-manage.service';
import { ChannelImportCandidate } from './channel-import-candidate.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChannelImportCandidate]),
    ChannelsModule,
    CategoriesModule,
    RankingModule,
  ],
  controllers: [AdminAutoManageController],
  providers: [AutoManageService],
})
export class AutoManageModule {}
