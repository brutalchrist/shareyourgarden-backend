import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { PushService } from '../services/push.service';
import { PushController } from './push.controller';

const user = { sub: '64b7f0c2a1b2c3d4e5f60718', email: 'jane@example.com' };

const mockPushService = {
  getPublicKey: jest.fn().mockReturnValue({ publicKey: 'public-key' }),
  subscribe: jest.fn().mockResolvedValue(undefined),
  unsubscribe: jest.fn().mockResolvedValue(undefined),
};

const validSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'BNcRdreALRFX', auth: 'tBHItJI5svbpez7KI4CCXg' },
  locale: 'es',
};

describe('PushController', () => {
  let app: INestApplication<App>;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushController],
      providers: [{ provide: PushService, useValue: mockPushService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: typeof user }>().user =
            user;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the public key', async () => {
    const response = await request(server())
      .get('/push/public-key')
      .expect(200);

    expect(response.body).toEqual({ publicKey: 'public-key' });
  });

  describe('POST /push/subscriptions', () => {
    it('subscribes the current user and answers 204', async () => {
      await request(server())
        .post('/push/subscriptions')
        .send({ ...validSubscription, expirationTime: null })
        .expect(204);

      // Unknown fields, like expirationTime from toJSON(), are stripped.
      expect(mockPushService.subscribe).toHaveBeenCalledWith(
        user,
        validSubscription,
      );
    });

    it.each([
      ['an http endpoint', { endpoint: 'http://push.example.com/abc' }],
      ['an endpoint that is not a URL', { endpoint: 'not a url' }],
      ['a missing endpoint', { endpoint: undefined }],
      ['missing keys', { keys: undefined }],
      ['a missing p256dh key', { keys: { auth: 'a' } }],
      ['an empty auth key', { keys: { p256dh: 'p', auth: '' } }],
      ['an unknown locale', { locale: 'fr' }],
      ['a missing locale', { locale: undefined }],
    ])('rejects %s with 400', async (_, override) => {
      const response = await request(server())
        .post('/push/subscriptions')
        .send({ ...validSubscription, ...override })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(mockPushService.subscribe).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /push/subscriptions', () => {
    it('unsubscribes the current user and answers 204', async () => {
      await request(server())
        .delete('/push/subscriptions')
        .send({ endpoint: validSubscription.endpoint })
        .expect(204);

      expect(mockPushService.unsubscribe).toHaveBeenCalledWith(user, {
        endpoint: validSubscription.endpoint,
      });
    });

    it('rejects a missing endpoint with 400', async () => {
      await request(server())
        .delete('/push/subscriptions')
        .send({})
        .expect(400);

      expect(mockPushService.unsubscribe).not.toHaveBeenCalled();
    });
  });
});
