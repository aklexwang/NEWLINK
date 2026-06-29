import { IsNotEmpty, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export class RegisterUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @ValidateIf(() => process.env.DEV_ADMIN_BYPASS !== 'true')
  @Matches(/^(EQ|UQ|kQ)[A-Za-z0-9_-]{46}$|^(0:|-1:)[a-fA-F0-9]{64}$/, {
    message: 'Valid TON wallet address required.',
  })
  tonWalletAddress: string;
}