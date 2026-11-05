import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { OAuth2Client } from 'google-auth-library';
import { Mongoose } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthModule } from './../src/auth/auth.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { User, UserSchema } from './../src/users/entities/user.entity';
import { UsersModule } from './../src/users/users.module';

// Unconnected model used to build documents exactly as Mongoose would,
// including schema defaults.
const castingModel = new Mongoose().model(User.name, UserSchema);

const ids = {
  jane: '64b7f0c2a1b2c3d4e5f60718',
  john: '64b7f0c2a1b2c3d4e5f60719',
};

type Update = { $set: Record<string, unknown> };

// In-memory stand-in for the User Mongoose model.
class FakeUserModel {
  docs = new Map<string, InstanceType<typeof castingModel>>();

  reset() {
    this.docs.clear();
    for (const [name, id] of Object.entries(ids)) {
      this.docs.set(
        id,
        new castingModel({
          _id: id,
          googleId: `google-${name}`,
          email: `${name}@example.com`,
          name,
        }),
      );
    }
  }

  findById(id: string) {
    return Promise.resolve(this.docs.get(id) ?? null);
  }

  async findByIdAndUpdate(id: string, update: Update) {
    const doc = this.docs.get(id);
    if (!doc) {
      return null;
    }
    doc.set(update.$set);
    await doc.validate();
    return doc;
  }
}

describe('UsersController (e2e)', () => {
  let app: INestApplication<App>;
  let userModel: FakeUserModel;
  let token: string;

  const server = () => app.getHttpServer();
  const patchMe = (body: unknown) =>
    request(server())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              GOOGLE_CLIENT_ID: 'test-client-id',
              JWT_SECRET: 'test-secret',
            }),
          ],
        }),
        AuthModule,
        UsersModule,
      ],
    })
      .overrideProvider(OAuth2Client)
      .useValue({})
      .overrideProvider(getModelToken(User.name))
      .useFactory({ factory: () => new FakeUserModel() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    userModel = moduleFixture.get(getModelToken(User.name));
    token = moduleFixture
      .get(JwtService)
      .sign({ sub: ids.jane, email: 'jane@example.com' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    userModel.reset();
  });

  it('GET /auth/me returns locale null for a user who never picked one', () => {
    return request(server())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, {
        id: ids.jane,
        email: 'jane@example.com',
        name: 'jane',
        locale: null,
        onboardingCompletedAt: null,
      });
  });

  describe('PATCH /users/me', () => {
    it.each(['es', 'en'])('stores locale %p', async (locale) => {
      await patchMe({ locale }).expect(200, {
        id: ids.jane,
        email: 'jane@example.com',
        name: 'jane',
        locale,
        onboardingCompletedAt: null,
      });

      const me = await request(server())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((me.body as { locale: string }).locale).toBe(locale);
    });

    it('clears the locale with null', async () => {
      await patchMe({ locale: 'en' }).expect(200);

      const response = await patchMe({ locale: null }).expect(200);

      expect((response.body as { locale: unknown }).locale).toBeNull();
    });

    it('only touches the signed-in user', async () => {
      await patchMe({ locale: 'en' }).expect(200);

      expect(userModel.docs.get(ids.jane)?.locale).toBe('en');
      expect(userModel.docs.get(ids.john)?.locale).toBeNull();
    });

    it('marks the welcome tour as seen and can reset it', async () => {
      const before = Date.now();

      const done = await patchMe({ onboardingCompleted: true }).expect(200);

      const seenAt = (done.body as { onboardingCompletedAt: string })
        .onboardingCompletedAt;
      expect(new Date(seenAt).getTime()).toBeGreaterThanOrEqual(before);
      expect((done.body as { locale: unknown }).locale).toBeNull();

      const reset = await patchMe({ onboardingCompleted: false }).expect(200);

      expect(
        (reset.body as { onboardingCompletedAt: unknown })
          .onboardingCompletedAt,
      ).toBeNull();
    });

    it.each([
      ['an unsupported locale', { locale: 'fr' }],
      ['a non-string locale', { locale: 1 }],
      ['a non-boolean onboardingCompleted', { onboardingCompleted: 'yes' }],
      ['a null onboardingCompleted', { onboardingCompleted: null }],
      ['an unknown field', { locale: 'es', email: 'evil@example.com' }],
    ])('returns 400 VALIDATION_FAILED for %s', async (_, body) => {
      const response = await patchMe(body).expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_FAILED',
      });
      expect(userModel.docs.get(ids.jane)?.locale).toBeNull();
      expect(userModel.docs.get(ids.jane)?.email).toBe('jane@example.com');
    });

    it('returns 401 without a token', () => {
      return request(server())
        .patch('/users/me')
        .send({ locale: 'es' })
        .expect(401, {
          statusCode: 401,
          message: 'Unauthorized',
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
        });
    });
  });
});
