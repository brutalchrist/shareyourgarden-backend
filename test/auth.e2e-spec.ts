import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { OAuth2Client } from 'google-auth-library';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthModule } from './../src/auth/auth.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { User } from './../src/users/entities/user.entity';
import { UsersService } from './../src/users/services/users.service';

const GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

const user = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  email: 'jane@example.com',
  name: 'Jane Doe',
  picture: 'https://example.com/jane.png',
  locale: null,
};

const googleClientMock = {
  verifyIdToken: jest.fn(),
};

const usersServiceMock = {
  upsertFromGoogle: jest.fn().mockResolvedValue(user),
  findById: jest.fn((id: string) =>
    Promise.resolve(id === user.id ? user : null),
  ),
};

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ GOOGLE_CLIENT_ID, JWT_SECRET: 'test-secret' })],
        }),
        AuthModule,
      ],
    })
      .overrideProvider(OAuth2Client)
      .useValue(googleClientMock)
      .overrideProvider(getModelToken(User.name))
      .useValue({})
      .overrideProvider(UsersService)
      .useValue(usersServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    googleClientMock.verifyIdToken.mockReset();
  });

  describe('POST /auth/google', () => {
    it('returns an access token and the user', async () => {
      googleClientMock.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-123',
          aud: GOOGLE_CLIENT_ID,
          email: user.email,
          email_verified: true,
          name: user.name,
          picture: user.picture,
        }),
      });

      const response = await request(app.getHttpServer())
        .post('/auth/google')
        .send({ credential: 'valid-token' })
        .expect(200);

      const body = response.body as { accessToken: string; user: unknown };
      expect(body.user).toEqual(user);
      expect(jwtService.verify(body.accessToken)).toMatchObject({
        sub: user.id,
        email: user.email,
      });
    });

    it('returns 400 when the credential is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/google')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_FAILED',
      });
    });

    it('returns 401 when the credential is invalid', async () => {
      googleClientMock.verifyIdToken.mockRejectedValue(new Error('invalid'));

      const response = await request(app.getHttpServer())
        .post('/auth/google')
        .send({ credential: 'bad-token' })
        .expect(401);

      expect(response.body).toEqual({
        statusCode: 401,
        message: 'Invalid Google credential',
        error: 'Unauthorized',
        code: 'INVALID_GOOGLE_CREDENTIAL',
      });
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user for a valid token', () => {
      const token = jwtService.sign({ sub: user.id, email: user.email });

      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect(user);
    });

    it('returns 401 with an UNAUTHORIZED code without a token', () => {
      return request(app.getHttpServer()).get('/auth/me').expect(401, {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
      });
    });

    it('returns 401 with a token signed by another secret', () => {
      const token = new JwtService({ secret: 'other-secret' }).sign({
        sub: user.id,
        email: user.email,
      });

      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });
});
