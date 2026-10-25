import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isTelegramSubmitLink } from '../telegram-avatar.logic';
import { LinkType } from '../channel.entity';

@ValidatorConstraint({ name: 'telegramSubmitLink', async: false })
export class TelegramSubmitLinkConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    return typeof value === 'string' && isTelegramSubmitLink(value);
  }

  defaultMessage(): string {
    return 't.me 또는 telegram.me 링크만 제보할 수 있습니다.';
  }
}

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @Validate(TelegramSubmitLinkConstraint)
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

  @IsOptional()
  @IsIn([LinkType.CHANNEL, LinkType.GROUP])
  type?: LinkType;

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

  /** 1 이면 확정된 검색으로 보고 익명 검색 기록에 남긴다(입력 중 자동완성은 보내지 않음). */
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  record?: boolean;
}
