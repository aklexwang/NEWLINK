import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestActorService } from '../analytics/request-actor.service';
import { StatsModule } from '../stats/stats.module';
import { Channel } from '../channels/channel.entity';
import { MemberActivity } from './member-activity.entity';
import { MemberActivityService } from './member-activity.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([MemberActivity, Channel]), StatsModule],
  providers: [MemberActivityService, RequestActorService],
  exports: [MemberActivityService],
})
export class MemberActivityModule {}
