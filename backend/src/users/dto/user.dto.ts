import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class RegisterUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^(EQ|UQ|kQ)[A-Za-z0-9_-]{46}$|^(0:|-1:)[a-fA-F0-9]{64}$/, {
    message: 'Valid TON wallet address required.',
  })
  tonWalletAddress: string;
}