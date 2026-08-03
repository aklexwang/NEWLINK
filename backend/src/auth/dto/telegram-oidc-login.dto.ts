import { IsNotEmpty, IsString } from 'class-validator';

export class TelegramOidcLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
