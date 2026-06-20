import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { ChannelsModule } from '../channels/channels.module';
import { UsersModule } from '../users/users.module';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminController } from './admin.controller';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [ChannelsModule, CategoriesModule, UsersModule],
  controllers: [AdminController, AdminPromotionsController, AdminCategoriesController, AdminUsersController],
})
export class AdminModule {}