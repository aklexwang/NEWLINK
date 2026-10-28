import {
  Body,
  Controller,
  Delete,
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
import {
  AdminInspectTextDto,
  AdminRegisterManyDto,
  AdminRegisterStartDto,
} from './dto/admin.dto';

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

  /** 등록을 마친 확인 목록 지우기 (등록된 채널은 그대로) */
  @Delete('inspect/:jobId')
  clear(@Param('jobId') jobId: string) {
    return this.inspect.clearJob(jobId);
  }

  /** 서버에서 혼자 끝까지 등록 (화면을 떠나도 계속) */
  @Post('register-start')
  registerStart(@Body() dto: AdminRegisterStartDto) {
    return this.inspect.startRegister(
      String(dto.jobId ?? ''),
      dto.ids,
      dto.category,
    );
  }

  @Get('register-status')
  registerStatus() {
    return this.inspect.registerStatus();
  }

  @Post('register-many')
  registerMany(@Body() dto: AdminRegisterManyDto) {
    return this.inspect.registerMany(dto.ids, dto.category);
  }
}
