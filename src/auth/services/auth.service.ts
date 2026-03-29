import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GoogleOAuthService } from './google-oauth.service';
import { AuthFlowService } from './auth-flow.service';
import { UsersService } from './users.service';
import { CookieService } from './cookie.service';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionCookieName =
    process.env.SESSION_COOKIE_NAME ?? 'syg_session';
  private readonly csrfCookieName = process.env.CSRF_COOKIE_NAME ?? 'syg_csrf';
  private readonly oauthNonceCookieName = 'syg_oauth_nonce';

  constructor(
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly authFlowService: AuthFlowService,
    private readonly usersService: UsersService,
    private readonly cookieService: CookieService,
    private readonly sessionService: SessionService,
  ) {}

  startGoogleAuth(returnTo: string, response: Response): void {
    this.authFlowService.validateReturnTo(returnTo);

    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!redirectUri) {
      throw new InternalServerErrorException(
        'GOOGLE_REDIRECT_URI is not configured',
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new InternalServerErrorException(
        'GOOGLE_CLIENT_ID is not configured',
      );
    }

    const { state, nonce } = this.authFlowService.createOAuthState(returnTo);
    response.cookie(this.oauthNonceCookieName, nonce, this.cookieOptions(true));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
    });

    response.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    );
  }

  async handleGoogleCallback(
    request: Request,
    response: Response,
  ): Promise<void> {
    const { code, state } = request.query;

    if (typeof code !== 'string' || typeof state !== 'string') {
      throw new UnauthorizedException('Missing OAuth callback parameters');
    }

    const statePayload = this.authFlowService.verifyOAuthState(state);
    const cookies = this.cookieService.parseCookies(request.headers.cookie);
    this.authFlowService.ensureNonceMatches(
      cookies[this.oauthNonceCookieName],
      statePayload.nonce,
    );

    this.authFlowService.validateReturnTo(statePayload.returnTo);

    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!redirectUri) {
      throw new InternalServerErrorException(
        'GOOGLE_REDIRECT_URI is not configured',
      );
    }

    const idToken = await this.googleOAuthService.exchangeCodeForIdToken(
      code,
      redirectUri,
    );
    const claims = await this.googleOAuthService.verifyIdToken(idToken);

    const user = await this.usersService.findOrCreateFromGoogle({
      sub: claims.sub,
      email: claims.email,
      name: claims.name,
      picture: claims.picture,
    });

    const session = this.sessionService.createSession({
      sub: claims.sub,
      email: user.email,
      name: user.name,
      picture: user.picture,
    });

    response.cookie(
      this.sessionCookieName,
      session.id,
      this.cookieOptions(true),
    );
    response.cookie(
      this.csrfCookieName,
      session.csrfToken,
      this.cookieOptions(false),
    );
    response.clearCookie(this.oauthNonceCookieName, this.cookieOptions(true));

    this.logger.log(`Google login success user=${user.email}`);
    response.redirect(statePayload.returnTo);
  }

  getSession(request: Request) {
    const cookies = this.cookieService.parseCookies(request.headers.cookie);
    const session = this.sessionService.getSession(
      cookies[this.sessionCookieName],
    );

    if (!session) {
      return { authenticated: false };
    }

    return {
      authenticated: true,
      user: session.user,
    };
  }

  logout(request: Request, response: Response) {
    const cookies = this.cookieService.parseCookies(request.headers.cookie);
    const session = this.sessionService.getSession(
      cookies[this.sessionCookieName],
    );

    if (!session) {
      response.clearCookie(this.sessionCookieName, this.cookieOptions(true));
      response.clearCookie(this.csrfCookieName, this.cookieOptions(false));
      return { success: true };
    }

    const csrfHeader = request.headers['x-csrf-token'];
    const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
    if (
      csrfToken !== session.csrfToken ||
      csrfToken !== cookies[this.csrfCookieName]
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    this.sessionService.invalidateSession(session.id);
    response.clearCookie(this.sessionCookieName, this.cookieOptions(true));
    response.clearCookie(this.csrfCookieName, this.cookieOptions(false));
    this.logger.log(`Logout success user=${session.user.email}`);

    return { success: true };
  }

  private cookieOptions(httpOnly: boolean) {
    return {
      httpOnly,
      secure: true,
      sameSite: 'none' as const,
      path: '/',
    };
  }
}
