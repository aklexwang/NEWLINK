import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { AdminNotificationService } from '../notifications/admin-notification.service';

@Controller('admin/notifications')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminNotificationsController {
  constructor(private readonly notifications: AdminNotificationService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.notifications.list(limit ? Number(limit) : 30);
  }

  @Post('read-all')
  async readAll() {
    await this.notifications.markAllRead();
    return { ok: true };
  }

  @Post(':id/read')
  async read(@Param('id') id: string) {
    await this.notifications.markRead(id);
    return { ok: true };
  }
}
