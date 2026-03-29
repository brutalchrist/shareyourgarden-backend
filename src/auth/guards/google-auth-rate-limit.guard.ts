import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class GoogleAuthRateLimitGuard implements CanActivate {
  private readonly maxAttempts = Number.parseInt(
    process.env.GOOGLE_AUTH_RATE_LIMIT_MAX ?? '10',
    10,
  );

  private readonly windowMs = Number.parseInt(
    process.env.GOOGLE_AUTH_RATE_LIMIT_WINDOW_MS ?? '60000',
    10,
  );

  private readonly attempts = new Map<string, RateLimitEntry>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? request.headers['x-forwarded-for'] ?? 'unknown';
    const key = Array.isArray(ip) ? ip[0] : String(ip);
    const now = Date.now();

    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (current.count >= this.maxAttempts) {
      throw new HttpException('Too many auth attempts', 429);
    }

    current.count += 1;
    return true;
  }
}
