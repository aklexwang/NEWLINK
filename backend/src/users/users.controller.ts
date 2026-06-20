import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { TelegramUserParam } from '../auth/telegram-user.decorator';
import type { TelegramUser } from '../auth/interfaces/telegram-user.interface';
import { RegisterUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(TelegramAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@TelegramUserParam() user: TelegramUser) {
    return this.usersService.getMe(user);
  }

  @Post('register')
  register(@TelegramUserParam() user: TelegramUser, @Body() dto: RegisterUserDto) {
    return this.usersService.register(user, dto);
  }
}