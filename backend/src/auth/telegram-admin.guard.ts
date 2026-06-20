import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedRequest } from './telegram-auth.guard';
import { TelegramAuthService } from './telegram-auth.service';

@Injectable()
export class TelegramAdminGuard implements CanActivate {
  constructor(private readonly telegramAuthService: TelegramAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.telegramInitData) {
      throw new ForbiddenException('인증이 필요합니다.');
    }

    const userId = request.telegramInitData.user.id;
    if (!this.telegramAuthService.isAdmin(userId)) {
      throw new ForbiddenException('관리자 권한이 필요합니다.');
    }

    return true;
  }
}
