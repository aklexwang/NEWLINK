import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import { TelegramLoginWidgetDto } from './dto/telegram-login-widget.dto';
import { JwtAuthService } from './jwt-auth.service';
import { TelegramAuthGuard, type AuthenticatedRequest } from './telegram-auth.guard';
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

  /** 웹 브라우저용 Telegram Login Widget */
  @Post('telegram-login')
  async loginWithTelegramWidget(@Body() dto: TelegramLoginWidgetDto) {
    const telegramUser = this.telegramAuthService.validateLoginWidget(dto);
    const { user, isNewUser } =
      await this.usersService.loginOrRegisterWithTelegram(telegramUser);

    return {
      accessToken: this.jwtAuthService.sign(user),
      isNewUser,
      user: this.usersService.toPublicUser(user),
    };
  }

  @Get('me')
  @UseGuards(TelegramAuthGuard)
  async me(@Req() req: AuthenticatedRequest) {
    const telegramId = req.telegramInitData?.user.id;
    if (!telegramId) {
      return { user: null };
    }
    const user = await this.usersService.findByTelegramId(telegramId);
    if (!user) {
      return { user: null };
    }
    return { user: this.usersService.toPublicUser(user) };
  }
}
