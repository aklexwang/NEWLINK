import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesModule } from '../categories/categories.module';
import { Channel } from '../channels/channel.entity';
import { ChannelsModule } from '../channels/channels.module';
import { PaymentsModule } from '../payments/payments.module';
import { StatsModule } from '../stats/stats.module';
import { StatsRun } from '../stats/stats-run.entity';
import { UsersModule } from '../users/users.module';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminCollectService } from './admin-collect.service';
import { AdminController } from './admin.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [
    ChannelsModule,
    CategoriesModule,
    UsersModule,
    PaymentsModule,
    StatsModule,
    TypeOrmModule.forFeature([Channel, StatsRun]),
  ],
  controllers: [
    AdminDashboardController,
    AdminController,
    AdminPromotionsController,
    AdminCategoriesController,
    AdminUsersController,
  ],
  providers: [AdminDashboardService, AdminCollectService],
})
export class AdminModule {}
