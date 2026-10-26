import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminNotification } from './admin-notification.entity';
import { AdminNotificationService } from './admin-notification.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdminNotification])],
  providers: [AdminNotificationService],
  exports: [AdminNotificationService],
})
export class NotificationsModule {}
