import { BadRequestException } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { isUuid } from '../../common/uuid.logic';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const STATS_RANGES = ['7', '14', '30'] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export class ChannelStatsQueryDto {
  @IsOptional()
  @IsIn(STATS_RANGES)
  range?: StatsRange = '7';
}

export class ChannelPostsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

export class ChannelEventsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

export class WeeklyStatsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-W\d{2}$/i, { message: 'week는 YYYY-Www 형식이어야 합니다.' })
  week?: string;
}

export class CompareStatsQueryDto {
  @IsString()
  ids: string;
}

export const RANKING_SORTS = [
  'score',
  'members',
  'views',
  'viewRate',
  'rising',
  'growth24h',
  'growth7d',
  'growth30d',
  'activity',
  'newest',
] as const;

export type RankingSort = (typeof RANKING_SORTS)[number];

export const SCORE_FAMILY_SORTS = new Set<string>([
  'score',
  'views',
  'viewRate',
  'rising',
  'growth24h',
  'growth7d',
  'growth30d',
  'activity',
  'newest',
]);

export class RankingQueryDto {
  @IsOptional()
  @IsIn(RANKING_SORTS)
  sort?: RankingSort;

  @IsOptional()
  @IsIn(['channel', 'group'])
  type?: 'channel' | 'group';

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  hideLowData?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  verifiedOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  includeForeign?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 50;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5_000)
  @IsOptional()
  offset?: number = 0;
}

export class HomeFeedQueryDto {
  @IsOptional()
  @IsIn(['channel', 'all', 'group'])
  type?: 'channel' | 'all' | 'group' = 'channel';

  @IsOptional()
  @IsString()
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 20;
}

export function parseCompareIds(raw: string): string[] {
  const ids = [
    ...new Set(
      raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.some((id) => !isUuid(id))) {
    throw new BadRequestException('ids는 uuid 형식이어야 합니다.');
  }
  return ids;
}
