import { Body, Controller, Post } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import { JwtAuthService } from './jwt-auth.service';
import { TelegramAuthService } from './telegram-auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly telegramAuthService: TelegramAuthService,
    private readonly usersService: UsersService,
    private readonly jwtAuthService: JwtAuthService,
  ) {}

  @Post('telegram')
  async loginWithTelegram(@Body() dto: TelegramAuthDto) {
    const initData = this.telegramAuthService.validateInitData(dto.initData);
    const { user, isNewUser } = await this.usersService.loginOrRegisterWithTelegram(
      initData.user,
    );

    return {
      accessToken: this.jwtAuthService.sign(user),
      isNewUser,
      user: this.usersService.toPublicUser(user),
    };
  }
}
