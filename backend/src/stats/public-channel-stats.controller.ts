import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ChannelEventsQueryDto,
  ChannelPostsQueryDto,
  ChannelStatsQueryDto,
} from './dto/public-stats.dto';
import { PublicStatsService } from './public-stats.service';

@Controller('channels')
export class PublicChannelStatsController {
  constructor(private readonly publicStatsService: PublicStatsService) {}

  @Get('by-username/:username/detail')
  getByUsername(@Param('username') username: string) {
    return this.publicStatsService.getDetailByUsername(username);
  }

  @Get(':id/detail')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicStatsService.getDetailById(id);
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
