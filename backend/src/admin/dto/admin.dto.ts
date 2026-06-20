import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ChannelStatus, LinkType } from '../../channels/channel.entity';

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
}