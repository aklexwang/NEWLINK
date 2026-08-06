import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { TelegramAvatarService } from './telegram-avatar.service';

@Controller('media')
export class TelegramAvatarController {
  constructor(private readonly telegramAvatarService: TelegramAvatarService) {}

  /** 텔레그램 채널/그룹 아바타를 서버에서 가져와 전달 (Render ephemeral uploads 대체) */
  @Get('telegram-avatar')
  @Header('Cache-Control', 'public, max-age=3600')
  async telegramAvatar(
    @Query('link') link?: string,
    @Query('username') username?: string,
  ): Promise<StreamableFile> {
    const key = (link ?? '').trim() || (username ?? '').trim();
    if (!key) {
      throw new BadRequestException('link 또는 username 이 필요합니다.');
    }

    const image = await this.telegramAvatarService.fetchAvatarImage({
      link: link?.trim(),
      username: username?.trim(),
    });

    if (!image) {
      throw new NotFoundException('아바타를 찾을 수 없습니다.');
    }

    return new StreamableFile(image.buffer, {
      type: image.contentType,
      disposition: 'inline',
    });
  }
}
