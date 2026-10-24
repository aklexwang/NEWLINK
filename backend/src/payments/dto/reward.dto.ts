import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class RewardSettingsPatchDto {
  @IsBoolean()
  enabled: boolean;
}

export class PayoutMethodCreateDto {
  @IsString()
  @MaxLength(32)
  code: string;

  @IsString()
  @MaxLength(64)
  label: string;

  @IsIn(['wallet_address', 'telegram_account'])
  destinationKind: 'wallet_address' | 'telegram_account';

  @IsString()
  @IsOptional()
  @MaxLength(32)
  network?: string;

  @IsString()
  @MaxLength(16)
  currency: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  defaultAmount?: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class PayoutMethodUpdateDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(0)
  defaultAmount?: number;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  label?: string;
}

export class SkipPayoutDto {
  @IsString()
  @MaxLength(500)
  reason: string;

  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class VoidPayoutDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class ConfirmPayoutDto {
  @IsString()
  @MaxLength(500)
  memo: string;
}

export class FailPayoutDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
