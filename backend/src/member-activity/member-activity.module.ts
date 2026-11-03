import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestActorService } from '../analytics/request-actor.service';
import { StatsModule } from '../stats/stats.module';
import { Channel } from '../channels/channel.entity';
import { MemberActivity } from './member-activity.entity';
import { MemberActivityService } from './member-activity.service';
import { Visitor } from './visitor.entity';
import { VisitorService } from './visitor.service';
import { User } from '../users/user.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([MemberActivity, Channel, Visitor, User]),
    StatsModule,
  ],
  providers: [MemberActivityService, RequestActorService, VisitorService],
  exports: [MemberActivityService, VisitorService],
})
export class MemberActivityModule {}
