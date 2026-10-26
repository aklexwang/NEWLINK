import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { BANNER_MAX_BYTES } from './ad-banner.logic';
import { AdsService, type BannerInput } from './ads.service';

type UploadFile = { buffer?: Buffer; size?: number };

const uploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: BANNER_MAX_BYTES + 1, files: 1 },
};

/** 회원 화면 배너 */
@Controller('ads')
export class PublicAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get('banners')
  banners() {
    return this.ads.listPublic();
  }

  @Get('banners/:id/image')
  async image(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { mime, data } = await this.ads.image(id);
    res.setHeader('Content-Type', mime);
    // 주소에 ?v=버전 이 붙어 바뀌면 새로 받으므로 오래 캐시해도 된다
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(data);
  }

  @Post('banners/:id/click')
  @HttpCode(204)
  async click(@Param('id', ParseUUIDPipe) id: string) {
    await this.ads.click(id);
  }
}

/** 어드민 배너 광고 관리 */
@Controller('admin/ad-banners')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminAdBannersController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  list() {
    return this.ads.listAdmin();
  }

  @Post()
  @UseInterceptors(FileInterceptor('image', uploadOptions))
  create(@Body() body: BannerInput, @UploadedFile() file?: UploadFile) {
    return this.ads.create(body, file);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('image', uploadOptions))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BannerInput,
    @UploadedFile() file?: UploadFile,
  ) {
    return this.ads.update(id, body, file);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ads.remove(id);
  }

  @Put('settings/rotate')
  async rotate(@Body() body: { seconds?: unknown }) {
    return { rotateSeconds: await this.ads.setRotateSeconds(body?.seconds) };
  }
}
