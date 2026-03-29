import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { GoogleAuthDto } from '../dto/google-auth.dto';
import { GoogleOAuthService } from './google-oauth.service';
import { UsersService } from './users.service';

interface AppJwtPayload {
  userId: string;
  email: string;
  roles: string[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly usersService: UsersService,
  ) {}

  async loginWithGoogle(dto: GoogleAuthDto) {
    try {
      this.googleOAuthService.validateRedirectUri(dto.redirectUri);

      const idToken = await this.googleOAuthService.exchangeCodeForIdToken(
        dto.code,
        dto.redirectUri,
      );
      const claims = await this.googleOAuthService.verifyIdToken(idToken);

      const user = await this.usersService.findOrCreateFromGoogle({
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
      });

      const token = this.signToken({
        userId: user.id,
        email: user.email,
        roles: user.roles ?? ['user'],
      });

      return {
        user: {
          sub: claims.sub,
          email: user.email,
          name: user.name,
          picture: user.picture,
        },
        token,
      };
    } catch (error) {
      this.logger.error(
        'Google login failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private signToken(payload: AppJwtPayload): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new InternalServerErrorException('JWT_SECRET is not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.parseExpiresIn(process.env.JWT_EXPIRES_IN ?? '1d');
    const body = {
      ...payload,
      iat: now,
      exp: now + expiresIn,
    };

    const headerBase64 = this.base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
    const payloadBase64 = this.base64UrlEncode(body);
    const signature = createHmac('sha256', secret)
      .update(`${headerBase64}.${payloadBase64}`)
      .digest('base64url');

    return `${headerBase64}.${payloadBase64}.${signature}`;
  }

  private base64UrlEncode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private parseExpiresIn(raw: string): number {
    const match = raw.match(/^(\d+)([smhd])?$/);
    if (!match) {
      throw new InternalServerErrorException(
        'JWT_EXPIRES_IN format is invalid',
      );
    }

    const amount = Number.parseInt(match[1], 10);
    const unit = match[2] ?? 's';
    const unitInSeconds: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return amount * unitInSeconds[unit];
  }
}
