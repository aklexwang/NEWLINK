import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { NoticesService, type NoticeInput } from './notices.service';

/** 회원 공지 (로그인한 회원만) */
@Controller('notices')
@UseGuards(TelegramAuthGuard)
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  list() {
    return this.notices.listPublic();
  }
}

@Controller('admin/notices')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminNoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  list() {
    return this.notices.listAdmin();
  }

  @Post()
  create(@Body() body: NoticeInput) {
    return this.notices.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: NoticeInput) {
    return this.notices.update(id, body ?? {});
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.notices.remove(id);
  }
}
