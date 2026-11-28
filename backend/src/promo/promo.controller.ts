import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { PromoJoinService } from './promo-join.service';
import { PromoService, PromoSettings } from './promo.service';

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** 어드민 · 홍보 자동화 */
@Controller('admin/promo')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class PromoController {
  constructor(
    private readonly promo: PromoService,
    private readonly joins: PromoJoinService,
  ) {}

  /** 홍보방 자동 가입 상태 */
  @Get('join')
  joinStatus() {
    return this.joins.getStatus();
  }

  @Patch('join')
  joinSettings(
    @Body() body: { enabled?: boolean; daily?: number; resume?: boolean },
  ) {
    return this.joins.updateSettings(body ?? {});
  }

  /** 지금 1곳 가입 (하루 한도·멈춤은 지킨다) */
  @Post('join/now')
  joinNow() {
    return this.joins.joinNext();
  }

  @Get('status')
  status() {
    return this.promo.getStatus();
  }

  @Patch('settings')
  settings(@Body() body: Partial<PromoSettings>) {
    return this.promo.updateSettings(body ?? {});
  }

  @Get('targets')
  targets() {
    return this.promo.listTargets();
  }

  @Post('targets/sync')
  sync() {
    return this.promo.syncTargets();
  }

  @Patch('targets/:id')
  updateTarget(
    @Param('id') id: string,
    @Body()
    body: {
      enabled?: boolean;
      dailyLimit?: number;
      minGapMinutes?: number;
      textOnly?: boolean;
    },
  ) {
    return this.promo.updateTarget(id, body ?? {});
  }

  @Post('targets/bulk')
  bulk(
    @Body()
    body: {
      ids?: string[] | 'all';
      enabled?: boolean;
      onlyClean?: boolean;
    },
  ) {
    if (typeof body?.enabled !== 'boolean')
      throw new BadRequestException('enabled 가 필요해요.');
    const ids =
      body.ids === 'all'
        ? 'all'
        : Array.isArray(body.ids)
          ? body.ids.slice(0, 1000)
          : [];
    return this.promo.bulkEnable(ids, body.enabled, body.onlyClean !== false);
  }

  @Get('creatives')
  creatives() {
    return this.promo.listCreatives();
  }

  @Post('creatives')
  createCreative(
    @Body()
    body: {
      text: string;
      imageUrl?: string | null;
      enabled?: boolean;
      source?: string;
    },
  ) {
    return this.promo.saveCreative(body ?? { text: '' });
  }

  @Patch('creatives/:id')
  updateCreative(
    @Param('id') id: string,
    @Body() body: { text: string; imageUrl?: string | null; enabled?: boolean },
  ) {
    return this.promo.saveCreative({ ...(body ?? { text: '' }), id });
  }

  @Delete('creatives/:id')
  deleteCreative(@Param('id') id: string) {
    return this.promo.deleteCreative(id);
  }

  @Post('creatives/suggest')
  suggest(@Body() body: { count?: number }) {
    return this.promo.suggestCopies(Number(body?.count) || 5);
  }

  @Post('images')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 512 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!IMAGE_MIME.has(file.mimetype)) {
          cb(
            new BadRequestException('PNG, JPG, WEBP 이미지만 올릴 수 있어요.'),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    return this.promo.uploadImage(file);
  }

  @Post('send-now')
  sendNow() {
    return this.promo.sendNext('manual');
  }

  @Get('logs')
  logs(@Query('limit') limit?: string) {
    return this.promo.listLogs(Number(limit) || 50);
  }
}
