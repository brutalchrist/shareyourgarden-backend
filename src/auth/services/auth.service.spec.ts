import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { AuthFlowService } from './auth-flow.service';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { GoogleOAuthService } from './google-oauth.service';
import { SessionService } from './session.service';
import { UsersService } from './users.service';

describe('AuthService', () => {
  let service: AuthService;

  const googleOAuthServiceMock = {
    exchangeCodeForIdToken: jest.fn(),
    verifyIdToken: jest.fn(),
  };

  const authFlowServiceMock = {
    validateReturnTo: jest.fn(),
    createOAuthState: jest.fn(),
    verifyOAuthState: jest.fn(),
    ensureNonceMatches: jest.fn(),
  };

  const usersServiceMock = {
    findOrCreateFromGoogle: jest.fn(),
  };

  const cookieServiceMock = {
    parseCookies: jest.fn(),
  };

  const sessionServiceMock = {
    createSession: jest.fn(),
    getSession: jest.fn(),
    invalidateSession: jest.fn(),
  };

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_REDIRECT_URI =
      'https://api.shareyourgarden.com/auth/google/callback';

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: GoogleOAuthService, useValue: googleOAuthServiceMock },
        { provide: AuthFlowService, useValue: authFlowServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: CookieService, useValue: cookieServiceMock },
        { provide: SessionService, useValue: sessionServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('starts google auth and redirects to google', () => {
    const cookieMock = jest.fn();
    const redirectMock = jest.fn();
    const res = {
      cookie: cookieMock,
      redirect: redirectMock,
    } as unknown as Response;

    authFlowServiceMock.createOAuthState.mockReturnValue({
      state: 'signed-state',
      nonce: 'nonce',
    });

    service.startGoogleAuth('https://shareyourgarden.com', res);

    expect(cookieMock).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(
      expect.stringContaining('https://accounts.google.com/o/oauth2/v2/auth?'),
    );
  });

  it('handles callback and creates session cookies', async () => {
    const req = {
      query: { code: 'code', state: 'state' },
      headers: { cookie: 'syg_oauth_nonce=nonce' },
    } as unknown as Request;
    const cookieMock = jest.fn();
    const clearCookieMock = jest.fn();
    const redirectMock = jest.fn();
    const res = {
      cookie: cookieMock,
      clearCookie: clearCookieMock,
      redirect: redirectMock,
    } as unknown as Response;

    authFlowServiceMock.verifyOAuthState.mockReturnValue({
      returnTo: 'https://shareyourgarden.com/app',
      nonce: 'nonce',
    });
    cookieServiceMock.parseCookies.mockReturnValue({
      syg_oauth_nonce: 'nonce',
    });
    googleOAuthServiceMock.exchangeCodeForIdToken.mockResolvedValue('id-token');
    googleOAuthServiceMock.verifyIdToken.mockResolvedValue({
      sub: 'google-sub',
      email: 'user@test.com',
      name: 'User',
      picture: 'pic',
    });
    usersServiceMock.findOrCreateFromGoogle.mockResolvedValue({
      email: 'user@test.com',
      name: 'User',
      picture: 'pic',
    });
    sessionServiceMock.createSession.mockReturnValue({
      id: 'session-id',
      csrfToken: 'csrf-token',
    });

    await service.handleGoogleCallback(req, res);

    expect(cookieMock).toHaveBeenCalledTimes(2);
    expect(clearCookieMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith(
      'https://shareyourgarden.com/app',
    );
  });

  it('returns unauthenticated when session is missing', () => {
    cookieServiceMock.parseCookies.mockReturnValue({});
    sessionServiceMock.getSession.mockReturnValue(null);

    const result = service.getSession({ headers: {} } as Request);

    expect(result).toEqual({ authenticated: false });
  });

  it('rejects logout with invalid csrf token', () => {
    cookieServiceMock.parseCookies.mockReturnValue({
      syg_session: 'session-id',
      syg_csrf: 'csrf-a',
    });
    sessionServiceMock.getSession.mockReturnValue({
      id: 'session-id',
      csrfToken: 'csrf-b',
      user: { email: 'user@test.com' },
    });

    expect(() =>
      service.logout(
        {
          headers: { 'x-csrf-token': 'csrf-a', cookie: '...' },
        } as unknown as Request,
        { clearCookie: jest.fn() } as unknown as Response,
      ),
    ).toThrow(ForbiddenException);
  });
});
