import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { UserDto } from '../../users/dtos/user.dto';
import { UsersService } from '../../users/services/users.service';
import { AuthResponseDto, JwtPayload } from '../dtos/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly googleClient: OAuth2Client,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  private async verifyGoogleCredential(
    credential: string,
  ): Promise<TokenPayload> {
    const audience = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (!payload || payload.aud !== audience) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (!payload.email || !payload.email_verified) {
      throw new UnauthorizedException('Google email is not verified');
    }

    return payload;
  }

  async loginWithGoogle(credential: string): Promise<AuthResponseDto> {
    const payload = await this.verifyGoogleCredential(credential);
    const user = await this.usersService.upsertFromGoogle(payload);
    const jwtPayload: JwtPayload = { sub: user.id, email: user.email };

    return {
      accessToken: await this.jwtService.signAsync(jwtPayload),
      user,
    };
  }

  async getCurrentUser(payload: JwtPayload): Promise<UserDto> {
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
