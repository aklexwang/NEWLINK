import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { AdminInspectService } from './admin-inspect.service';
import { AdminInspectTextDto, AdminRegisterManyDto } from './dto/admin.dto';

@Controller('admin/links')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminInspectController {
  constructor(private readonly inspect: AdminInspectService) {}

  @Post('inspect')
  @HttpCode(HttpStatus.ACCEPTED)
  start(@Body() dto: AdminInspectTextDto) {
    return this.inspect.startInspect(dto.text, dto.category);
  }

  @Get('inspect/latest')
  latest() {
    return this.inspect.getLatest();
  }

  @Get('inspect/:jobId')
  getJob(@Param('jobId') jobId: string) {
    return this.inspect.getJob(jobId);
  }

  @Post('inspect/:jobId/resume')
  @HttpCode(HttpStatus.ACCEPTED)
  resume(@Param('jobId') jobId: string) {
    return this.inspect.resumeInspect(jobId);
  }

  @Post('register-many')
  registerMany(@Body() dto: AdminRegisterManyDto) {
    return this.inspect.registerMany(dto.ids, dto.category);
  }
}
