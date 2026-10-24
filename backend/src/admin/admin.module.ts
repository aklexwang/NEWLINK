import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesModule } from '../categories/categories.module';
import { Channel } from '../channels/channel.entity';
import { ChannelsModule } from '../channels/channels.module';
import { PaymentsModule } from '../payments/payments.module';
import { DiscoveredUsername } from '../stats/discovered-username.entity';
import { MtprotoState } from '../stats/mtproto-state.entity';
import { StatsModule } from '../stats/stats.module';
import { StatsRun } from '../stats/stats-run.entity';
import { UsersModule } from '../users/users.module';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminCollectService } from './admin-collect.service';
import { AdminController } from './admin.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [
    ChannelsModule,
    CategoriesModule,
    UsersModule,
    PaymentsModule,
    StatsModule,
    TypeOrmModule.forFeature([
      Channel,
      StatsRun,
      DiscoveredUsername,
      MtprotoState,
    ]),
  ],
  controllers: [
    AdminDashboardController,
    AdminStatsController,
    AdminController,
    AdminPromotionsController,
    AdminCategoriesController,
    AdminUsersController,
  ],
  providers: [AdminDashboardService, AdminCollectService, AdminStatsService],
})
export class AdminModule {}
