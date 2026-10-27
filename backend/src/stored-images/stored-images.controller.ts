import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StoredImagesService } from './stored-images.service';

@Controller('images')
export class StoredImagesController {
  constructor(private readonly images: StoredImagesService) {}

  /** 누구나 볼 수 있는 이미지. id 가 바뀌지 않으므로 오래 캐시한다 */
  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { mime, data } = await this.images.read(id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // SVG 안의 스크립트가 실행되지 않게
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    res.end(data);
  }
}
