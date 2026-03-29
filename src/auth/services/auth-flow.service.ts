import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

interface OAuthStatePayload {
  returnTo: string;
  nonce: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthFlowService {
  private readonly stateTtlSeconds = Number.parseInt(
    process.env.GOOGLE_OAUTH_STATE_TTL_SECONDS ?? '600',
    10,
  );

  private readonly secret = process.env.SESSION_SECRET;

  createOAuthState(returnTo: string): { state: string; nonce: string } {
    const now = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(16).toString('hex');
    const payload: OAuthStatePayload = {
      returnTo,
      nonce,
      iat: now,
      exp: now + this.stateTtlSeconds,
    };

    return {
      state: this.sign(payload),
      nonce,
    };
  }

  verifyOAuthState(state: string): OAuthStatePayload {
    const payload = this.verify<OAuthStatePayload>(state);

    if (!payload.returnTo || !payload.nonce || !payload.exp) {
      throw new UnauthorizedException('Invalid OAuth state payload');
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Expired OAuth state');
    }

    return payload;
  }

  validateReturnTo(returnTo: string): void {
    const allowlist = this.getReturnToAllowlist();
    let parsed: URL;

    try {
      parsed = new URL(returnTo);
    } catch {
      throw new ForbiddenException('Invalid return_to URL');
    }

    const origin = parsed.origin;
    const isAllowed = allowlist.some((pattern) =>
      this.matchesPattern(origin, pattern),
    );

    if (!isAllowed) {
      throw new ForbiddenException('return_to is not allowed');
    }
  }

  ensureNonceMatches(
    cookieNonce: string | undefined,
    stateNonce: string,
  ): void {
    if (!cookieNonce) {
      throw new UnauthorizedException('Missing OAuth nonce cookie');
    }

    const left = Buffer.from(cookieNonce);
    const right = Buffer.from(stateNonce);

    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Invalid OAuth nonce');
    }
  }

  getReturnToAllowlist(): string[] {
    return (process.env.FRONTEND_RETURN_TO_ALLOWLIST ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private sign(payload: object): string {
    if (!this.secret) {
      throw new InternalServerErrorException(
        'SESSION_SECRET is not configured',
      );
    }

    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = createHmac('sha256', this.secret)
      .update(encodedPayload)
      .digest('base64url');
    return `${encodedPayload}.${signature}`;
  }

  private verify<T>(token: string): T {
    if (!this.secret) {
      throw new InternalServerErrorException(
        'SESSION_SECRET is not configured',
      );
    }

    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Malformed signed state');
    }

    const expected = createHmac('sha256', this.secret)
      .update(encodedPayload)
      .digest('base64url');

    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Invalid state signature');
    }

    return JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as T;
  }

  private matchesPattern(value: string, pattern: string): boolean {
    if (!pattern.includes('*')) {
      return value === pattern;
    }

    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(value);
  }
}
