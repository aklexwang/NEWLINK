import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CategoriesModule } from '../categories/categories.module';
import { Channel } from '../channels/channel.entity';
import { ChannelsModule } from '../channels/channels.module';
import { PaymentsModule } from '../payments/payments.module';
import { DiscoveryKeyword } from '../stats/discovery-keyword.entity';
import { DiscoveredUsername } from '../stats/discovered-username.entity';
import { MtprotoState } from '../stats/mtproto-state.entity';
import { StatsModule } from '../stats/stats.module';
import { StatsRun } from '../stats/stats-run.entity';
import { UsersModule } from '../users/users.module';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminReclassifyController } from './admin-reclassify.controller';
import { AdminCollectService } from './admin-collect.service';
import { AdminController } from './admin.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminOpensController } from './admin-opens.controller';
import { AdminSearchController } from './admin-search.controller';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminInspectController } from './admin-inspect.controller';
import { AdminInspectItem } from './admin-inspect-item.entity';
import { AdminInspectJob } from './admin-inspect-job.entity';
import { AdminDiscoveryController } from './admin-discovery.controller';
import { AdminDiscoveryService } from './admin-discovery.service';
import { AdminInspectService } from './admin-inspect.service';
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
    AnalyticsModule,
    TypeOrmModule.forFeature([
      Channel,
      StatsRun,
      DiscoveredUsername,
      DiscoveryKeyword,
      MtprotoState,
      AdminInspectJob,
      AdminInspectItem,
    ]),
  ],
  controllers: [
    AdminDashboardController,
    AdminStatsController,
    AdminInspectController,
    AdminDiscoveryController,
    AdminController,
    AdminPromotionsController,
    AdminCategoriesController,
    AdminReclassifyController,
    AdminUsersController,
    AdminSearchController,
    AdminOpensController,
  ],
  providers: [
    AdminDashboardService,
    AdminCollectService,
    AdminStatsService,
    AdminInspectService,
    AdminDiscoveryService,
  ],
})
export class AdminModule {}
