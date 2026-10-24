import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { parseTelegramAvatarPageLink } from './telegram-avatar.logic';
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
    const parsed = parseTelegramAvatarPageLink(link, username);
    if (!parsed.ok) {
      throw new BadRequestException(parsed.message);
    }

    const image = await this.telegramAvatarService.fetchAvatarImage({
      link: parsed.link,
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
