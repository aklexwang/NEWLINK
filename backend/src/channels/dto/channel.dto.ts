import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { LinkType } from '../channel.entity';

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsUrl()
  @MaxLength(512)
  link: string;

  @IsIn([LinkType.CHANNEL, LinkType.GROUP])
  linkType: LinkType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}

export class SearchChannelDto {
  @IsString()
  @IsOptional()
  q?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 20;
}
