import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  /** Google OTP 6자리 또는 백업 코드 8자리 (OTP 를 켠 경우) */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  otp?: string;
}
