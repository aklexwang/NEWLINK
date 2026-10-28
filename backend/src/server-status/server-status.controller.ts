import { Controller, Get, UseGuards } from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { ServerStatusService } from './server-status.service';

@Controller('admin/server-status')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class ServerStatusController {
  constructor(private readonly service: ServerStatusService) {}

  @Get()
  status() {
    return this.service.status();
  }
}
