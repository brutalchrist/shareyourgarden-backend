import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from '../src/auth/auth.controller';
import { GoogleAuthRateLimitGuard } from '../src/auth/guards/google-auth-rate-limit.guard';
import { AuthFlowService } from '../src/auth/services/auth-flow.service';
import { AuthService } from '../src/auth/services/auth.service';
import { CookieService } from '../src/auth/services/cookie.service';
import { GoogleOAuthService } from '../src/auth/services/google-oauth.service';
import { SessionService } from '../src/auth/services/session.service';
import { UsersService } from '../src/auth/services/users.service';

function readSetCookies(headers: unknown): string[] {
  if (!headers || typeof headers !== 'object') {
    return [];
  }

  const value = (headers as Record<string, unknown>)['set-cookie'];
  if (Array.isArray(value)) {
    return value.filter(
      (cookie): cookie is string => typeof cookie === 'string',
    );
  }

  return typeof value === 'string' ? [value] : [];
}

describe('Auth broker endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let flowService: AuthFlowService;

  const googleOAuthServiceMock = {
    exchangeCodeForIdToken: jest.fn().mockResolvedValue('id-token'),
    verifyIdToken: jest.fn().mockResolvedValue({
      sub: 'google-sub',
      email: 'user@test.com',
      name: 'User',
      picture: 'pic',
    }),
  };

  const usersServiceMock = {
    findOrCreateFromGoogle: jest.fn().mockResolvedValue({
      email: 'user@test.com',
      name: 'User',
      picture: 'pic',
    }),
  };

  beforeEach(async () => {
    process.env.SESSION_SECRET = 'session-secret';
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_REDIRECT_URI =
      'https://api.shareyourgarden.com/auth/google/callback';
    process.env.FRONTEND_RETURN_TO_ALLOWLIST =
      'https://shareyourgarden.com,https://deploy-preview-*.--shareyourgarden.netlify.app';

    const moduleFixture = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        AuthFlowService,
        CookieService,
        SessionService,
        GoogleAuthRateLimitGuard,
        { provide: GoogleOAuthService, useValue: googleOAuthServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
      ],
    }).compile();

    flowService = moduleFixture.get(AuthFlowService);

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /auth/google/start accepts netlify preview return_to', async () => {
    const returnTo =
      'https://deploy-preview-123.--shareyourgarden.netlify.app/dashboard';

    await request(app.getHttpServer())
      .get('/auth/google/start')
      .query({ return_to: returnTo })
      .expect(302)
      .expect((res) => {
        expect(res.headers.location).toContain(
          'accounts.google.com/o/oauth2/v2/auth',
        );
      });
  });

  it('full callback -> session -> logout flow', async () => {
    const returnTo = 'https://shareyourgarden.com/app';
    const { state, nonce } = flowService.createOAuthState(returnTo);

    const callbackResponse = await request(app.getHttpServer())
      .get('/auth/google/callback')
      .set('Cookie', [`syg_oauth_nonce=${nonce}`])
      .query({ code: 'auth-code', state })
      .expect(302);

    expect(callbackResponse.headers.location).toBe(returnTo);

    const setCookies = readSetCookies(callbackResponse.headers);
    const sessionCookie = setCookies.find((cookie) =>
      cookie.startsWith('syg_session='),
    );
    const csrfCookie = setCookies.find((cookie) =>
      cookie.startsWith('syg_csrf='),
    );
    expect(sessionCookie).toBeDefined();
    expect(csrfCookie).toBeDefined();

    const sessionValue = sessionCookie?.split(';')[0] ?? '';
    const csrfValue = csrfCookie?.split(';')[0] ?? '';
    const csrfToken = csrfValue.split('=')[1] ?? '';

    await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', [sessionValue])
      .expect(200)
      .expect(
        ({
          body,
        }: {
          body: { authenticated: boolean; user: { email: string } };
        }) => {
          expect(body.authenticated).toBe(true);
          expect(body.user.email).toBe('user@test.com');
        },
      );

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', [sessionValue, csrfValue])
      .set('x-csrf-token', csrfToken)
      .expect(200)
      .expect(({ body }: { body: { success: boolean } }) => {
        expect(body.success).toBe(true);
      });
  });
});
