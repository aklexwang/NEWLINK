import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { TelegramOpenService } from './telegram-open.service';

/**
 * "텔레그램에서 열기" 이동 기록. 로그인 없이 호출할 수 있고(로그인했으면 ID 로 구분),
 * 결과와 상관없이 항상 204 를 돌려준다(채널 존재 여부 등을 알려주지 않는다).
 */
@Controller('channels')
export class TelegramOpenController {
  constructor(private readonly opens: TelegramOpenService) {}

  @Post(':id/telegram-open')
  @HttpCode(204)
  async telegramOpen(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.opens.recordFromRequest(req, id);
  }
}
