import {
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
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ChannelStatus, LinkType } from '../../channels/channel.entity';

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

  @IsIn([LinkType.CHANNEL, LinkType.GROUP])
  linkType: LinkType;

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
}

export class ApproveChannelDto {
  @IsBoolean()
  @IsOptional()
  isPromoted?: boolean;
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
}