import { ValidationPipe } from '@nestjs/common';
import { INestApplication } from '@nestjs/common/interfaces';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from '../src/auth/auth.controller';
import { GoogleAuthRateLimitGuard } from '../src/auth/guards/google-auth-rate-limit.guard';
import { AuthService } from '../src/auth/services/auth.service';

describe('Auth Google endpoint (e2e)', () => {
  let app: INestApplication<App>;

  const authServiceMock = {
    loginWithGoogle: jest.fn().mockResolvedValue({
      user: {
        name: 'Test User',
        email: 'test@example.com',
        picture: 'https://image',
        sub: 'google-sub',
      },
      token: 'app-jwt-token',
    }),
  };

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        GoogleAuthRateLimitGuard,
        { provide: AuthService, useValue: authServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /auth/google returns user and token', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ code: 'valid-code', redirectUri: 'https://shareyourgarden.app' })
      .expect(200)
      .expect(
        ({ body }: { body: { user: { email: string }; token: string } }) => {
          expect(body.user.email).toBe('test@example.com');
          expect(body.token).toBe('app-jwt-token');
        },
      );
  });

  it('POST /auth/google validates payload', async () => {
    await request(app.getHttpServer())
      .post('/auth/google')
      .send({ code: '', redirectUri: 'invalid' })
      .expect(400);
  });
});
