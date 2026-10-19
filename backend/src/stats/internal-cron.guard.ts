import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

@Injectable()
export class InternalCronGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = (
      this.configService.get<string>('INTERNAL_CRON_TOKEN') ?? ''
    ).trim();
    if (!expected) {
      throw new UnauthorizedException('내부 토큰이 설정되지 않았습니다.');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.headers['x-internal-token'];
    const received = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
    if (!tokensEqual(expected, received)) {
      throw new UnauthorizedException('내부 토큰이 올바르지 않습니다.');
    }
    return true;
  }
}

function tokensEqual(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
