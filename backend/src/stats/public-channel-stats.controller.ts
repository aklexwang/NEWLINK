import {
  Controller,
  Get,
  Optional,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { MemberActivityService } from '../member-activity/member-activity.service';
import {
  ChannelEventsQueryDto,
  ChannelPostsQueryDto,
  ChannelStatsQueryDto,
} from './dto/public-stats.dto';
import { PublicStatsService } from './public-stats.service';
import { PostPreviewService } from './post-preview.service';

@Controller('channels')
export class PublicChannelStatsController {
  constructor(
    private readonly publicStatsService: PublicStatsService,
    private readonly postPreview: PostPreviewService,
    @Optional() private readonly memberActivity?: MemberActivityService,
  ) {}

  @Get('by-username/:username/detail')
  async getByUsername(
    @Param('username') username: string,
    @Req() req: Request,
  ) {
    const detail = await this.publicStatsService.getDetailByUsername(username);
    const id = (detail as { id?: string } | null)?.id;
    if (id)
      this.memberActivity?.recordFromRequest(req, 'view', { channelId: id });
    return detail;
  }

  @Get(':id/detail')
  async getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const detail = await this.publicStatsService.getDetailById(id);
    this.memberActivity?.recordFromRequest(req, 'view', { channelId: id });
    return detail;
  }

  /** 홈 피드: 텔레그램 글 하나를 직접 그릴 정보(글·사진·조회수) */
  @Get(':id/post-preview')
  postPreviewOf(@Param('id', ParseUUIDPipe) id: string, @Query('m') m: string) {
    return this.postPreview.get(id, Number(m));
  }

  @Get(':id/stats')
  getStats(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ChannelStatsQueryDto,
  ) {
    return this.publicStatsService.getStatsSeries(id, query.range ?? '7');
  }

  @Get(':id/posts')
  getPosts(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ChannelPostsQueryDto,
  ) {
    return this.publicStatsService.getPosts(id, query.limit ?? 20);
  }

  @Get(':id/events')
  getEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ChannelEventsQueryDto,
  ) {
    return this.publicStatsService.getEvents(id, query.limit ?? 20);
  }

  @Get(':id/media-mix')
  getMediaMix(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicStatsService.getMediaMix(id);
  }
}
