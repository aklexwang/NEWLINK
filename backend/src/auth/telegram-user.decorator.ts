import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from './telegram-auth.guard';
import { TelegramUser } from './interfaces/telegram-user.interface';

export const TelegramUserParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TelegramUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.telegramInitData!.user;
  },
);
