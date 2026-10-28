import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ChannelStatus, LinkType } from '../../channels/channel.entity';
import type { ChannelLanguage } from '../../channels/channel.entity';

export class CandidateIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class LookupChannelQueryDto {
  @IsString()
  @IsNotEmpty()
  link: string;
}

export class AdminCreateChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  link: string;

  @IsOptional()
  @IsIn([LinkType.CHANNEL, LinkType.GROUP])
  linkType?: LinkType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsBoolean()
  @IsOptional()
  isPromoted?: boolean;

  /** 거절된 같은 링크 행이 있을 때, 새로 만들지 않고 그 행을 다시 활성화할지 */
  @IsBoolean()
  @IsOptional()
  reactivateRejected?: boolean;
}

export class ApproveChannelDto {
  @IsBoolean()
  @IsOptional()
  isPromoted?: boolean;

  /** 승인하면서 정하는 카테고리 */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;
}

export class PromoteChannelDto {
  @IsDateString()
  @IsOptional()
  promotedUntil?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  durationDays?: number;

  @IsInt()
  @IsOptional()
  clientTelegramId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  clientName?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  tonAmount?: number;
}

export class RecordRewardDto {
  @IsNumber()
  @Min(0.000001)
  @IsOptional()
  amountTon?: number;

  @IsNumber()
  @Min(0.000001)
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  @MaxLength(128)
  wallet?: string;

  @IsOptional()
  @IsIn(['tonconnect', 'external'])
  method?: 'tonconnect' | 'external';

  @IsOptional()
  @IsIn(['tonconnect', 'external', 'manual_gift', 'bot_gift'])
  sendMethod?: 'tonconnect' | 'external' | 'manual_gift' | 'bot_gift';

  @IsOptional()
  @IsIn(['TON', 'STARS', 'USDT'])
  currency?: 'TON' | 'STARS' | 'USDT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsIn(['sending', 'paid', 'failed'])
  phase?: 'sending' | 'paid' | 'failed';

  @IsOptional()
  @IsUUID()
  payoutRecordId?: string;

  @IsOptional()
  @IsUUID()
  methodId?: string;
}

export class UpdateChannelDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @IsIn([LinkType.CHANNEL, LinkType.GROUP])
  @IsOptional()
  linkType?: LinkType;

  @IsEnum(ChannelStatus)
  @IsOptional()
  status?: ChannelStatus;

  @IsBoolean()
  @IsOptional()
  isPromoted?: boolean;

  @IsDateString()
  @IsOptional()
  promotedUntil?: string | null;

  @IsInt()
  @IsOptional()
  promotionClientTelegramId?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  promotionClientName?: string | null;

  @IsNumber()
  @Min(0)
  @IsOptional()
  promotionTonAmount?: number | null;

  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @IsOptional()
  @MaxLength(1024)
  avatarUrl?: string | null;

  @IsBoolean()
  @IsOptional()
  avatarApproved?: boolean;

  @IsIn(['ko', 'foreign', 'unknown'])
  @IsOptional()
  language?: ChannelLanguage;

  @IsBoolean()
  @IsOptional()
  languageLocked?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  link?: string;

  @IsBoolean()
  @IsOptional()
  isVisible?: boolean;

  @IsBoolean()
  @IsOptional()
  categoryLocked?: boolean;

  @IsBoolean()
  @IsOptional()
  illegalCleared?: boolean;

  /** 제목 고정. true 면 수집이 제목을 덮어쓰지 않는다 */
  @IsBoolean()
  @IsOptional()
  titleLocked?: boolean;
}

export class BulkVisibilityDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids: string[];

  @IsBoolean()
  isVisible: boolean;
}

export class BulkCategoryDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;
}

export class BulkCollectDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class GoogleSearchCandidatesDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  topic?: string;

  @IsIn(['site', 'groups', 'intitle', 'invite', 'directory', 'custom'])
  preset: 'site' | 'groups' | 'intitle' | 'invite' | 'directory' | 'custom';

  @ValidateIf((o: GoogleSearchCandidatesDto) => o.preset === 'custom')
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  customQuery?: string;

  /** 비우거나 auto면 AI 자동 분류 */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  pages?: number;

  /** 기본 true: 주제 단어가 링크·제목·설명에 실제로 들어있는 결과만 수집 */
  @IsBoolean()
  @IsOptional()
  strictTopic?: boolean;
}

export class AdminInspectTextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300_000)
  text: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;
}

export class DiscoveryUsernamesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  usernames: string[];

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;
}

export class DiscoveryKeywordCreateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  word: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;
}

export class DiscoveryKeywordUpdateDto {
  @IsString()
  @IsOptional()
  @MaxLength(64)
  word?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsInt()
  @IsOptional()
  sort?: number;
}

export class DiscoveryKeywordReorderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class AdminRegisterManyDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids: string[];

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;
}

export class AdminRegisterStartDto extends AdminRegisterManyDto {
  @IsString()
  @IsOptional()
  @MaxLength(64)
  jobId?: string;
}

export class UpdateImportCandidateDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @IsBoolean()
  @IsOptional()
  categoryReviewed?: boolean;

  @IsIn(['channel', 'group'])
  @IsOptional()
  linkType?: 'channel' | 'group';

  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string;
}

/** 검색 금지어·예외어 추가 */
export class SearchTermCreateDto {
  @IsIn(['block', 'allow'])
  kind: 'block' | 'allow';

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  term: string;
}

/** 검색 금지어·예외어 수정(켜기/끄기, 단어 변경) */
export class SearchTermUpdateDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  term?: string;
}
