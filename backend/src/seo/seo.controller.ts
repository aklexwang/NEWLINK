import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SeoService } from './seo.service';

@Controller('seo')
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Get('sitemap.xml')
  async sitemap(@Res() res: Response) {
    const xml = await this.seoService.sitemapXml();
    this.sendXml(res, xml);
  }

  @Get('sitemaps/:page')
  async sitemapPage(
    @Param('page', ParseIntPipe) page: number,
    @Res() res: Response,
  ) {
    const xml = await this.seoService.sitemapXml(page);
    this.sendXml(res, xml);
  }

  private sendXml(res: Response, xml: string) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  }
}
