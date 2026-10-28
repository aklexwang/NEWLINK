import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from '../ads/app-setting.entity';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServerStatusController } from './server-status.controller';
import { ServerStatusService } from './server-status.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting]), NotificationsModule],
  controllers: [ServerStatusController],
  providers: [ServerStatusService, TelegramAdminNotifyService],
})
export class ServerStatusModule {}
