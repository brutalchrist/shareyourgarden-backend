import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { sendNotification, setVapidDetails, WebPushError } from 'web-push';
import { PushSubscription } from '../entities/push-subscription.entity';
import { MessagePushContent, PushService } from './push.service';

jest.mock('web-push', () => ({
  ...jest.requireActual<typeof import('web-push')>('web-push'),
  sendNotification: jest.fn(),
  setVapidDetails: jest.fn(),
}));

const sendNotificationMock = jest.mocked(sendNotification);

const userId = '64b7f0c2a1b2c3d4e5f60718';
const recipientId = new Types.ObjectId('64b7f0c2a1b2c3d4e5f60719');
const jwtPayload = { sub: userId, email: 'jane@example.com' };

const vapidConfig = {
  VAPID_PUBLIC_KEY: 'public-key',
  VAPID_PRIVATE_KEY: 'private-key',
  VAPID_SUBJECT: 'mailto:admin@example.com',
};

const content: MessagePushContent = {
  type: 'message',
  conversationId: '64b7f0c2a1b2c3d4e5f60720',
  senderName: 'Bob',
  gardenName: 'Huerta Norte',
  unread: 2,
};

const subscription = (
  endpoint: string,
  locale: 'es' | 'en',
  _id = new Types.ObjectId(),
) => ({
  _id,
  user: recipientId,
  endpoint,
  keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` },
  locale,
});

const pushSubscriptionModelMock = {
  find: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn(),
};

const findReturns = (subscriptions: unknown[]) =>
  pushSubscriptionModelMock.find.mockReturnValue({
    exec: jest.fn().mockResolvedValue(subscriptions),
  });

const createService = async (config: Record<string, string>) => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PushService,
      {
        provide: getModelToken(PushSubscription.name),
        useValue: pushSubscriptionModelMock,
      },
      { provide: ConfigService, useValue: new ConfigService(config) },
    ],
  }).compile();

  return module.get<PushService>(PushService);
};

describe('PushService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendNotificationMock.mockResolvedValue({
      statusCode: 201,
      body: '',
      headers: {},
    });
  });

  describe('when configured', () => {
    let service: PushService;

    beforeEach(async () => {
      service = await createService(vapidConfig);
    });

    it('sets the VAPID details and exposes the public key', () => {
      expect(setVapidDetails).toHaveBeenCalledWith(
        'mailto:admin@example.com',
        'public-key',
        'private-key',
      );
      expect(service.getPublicKey()).toEqual({ publicKey: 'public-key' });
    });

    it('upserts the subscription by endpoint for the current user', async () => {
      await service.subscribe(jwtPayload, {
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh: 'p', auth: 'a' },
        locale: 'en',
      });

      expect(pushSubscriptionModelMock.updateOne).toHaveBeenCalledWith(
        { endpoint: 'https://push.example.com/abc' },
        {
          $set: {
            user: new Types.ObjectId(userId),
            keys: { p256dh: 'p', auth: 'a' },
            locale: 'en',
          },
        },
        { upsert: true, runValidators: true },
      );
    });

    it("only deletes the current user's subscription", async () => {
      await service.unsubscribe(jwtPayload, {
        endpoint: 'https://push.example.com/abc',
      });

      expect(pushSubscriptionModelMock.deleteOne).toHaveBeenCalledWith({
        endpoint: 'https://push.example.com/abc',
        user: new Types.ObjectId(userId),
      });
    });

    it("sends to each of the recipient's subscriptions in its locale", async () => {
      findReturns([
        subscription('https://push.example.com/es', 'es'),
        subscription('https://push.example.com/en', 'en'),
      ]);

      await service.notifyMessage(recipientId, () => Promise.resolve(content));

      expect(pushSubscriptionModelMock.find).toHaveBeenCalledWith({
        user: recipientId,
      });
      expect(sendNotificationMock).toHaveBeenCalledTimes(2);
      expect(sendNotificationMock).toHaveBeenCalledWith(
        {
          endpoint: 'https://push.example.com/es',
          keys: {
            p256dh: 'p256dh-https://push.example.com/es',
            auth: 'auth-https://push.example.com/es',
          },
        },
        JSON.stringify({ ...content, locale: 'es' }),
        {
          TTL: 24 * 60 * 60,
          urgency: 'normal',
          topic: content.conversationId,
        },
      );
      expect(sendNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'https://push.example.com/en' }),
        JSON.stringify({ ...content, locale: 'en' }),
        expect.anything(),
      );
    });

    it('does not build the payload when the recipient has no subscriptions', async () => {
      findReturns([]);
      const build = jest.fn().mockResolvedValue(content);

      await service.notifyMessage(recipientId, build);

      expect(build).not.toHaveBeenCalled();
      expect(sendNotificationMock).not.toHaveBeenCalled();
    });

    it.each([404, 410])(
      'deletes a subscription the push service answers %i for',
      async (statusCode) => {
        const gone = subscription('https://push.example.com/gone', 'es');
        findReturns([gone, subscription('https://push.example.com/ok', 'es')]);
        sendNotificationMock.mockImplementation(({ endpoint }) =>
          endpoint === gone.endpoint
            ? Promise.reject(
                new WebPushError('Gone', statusCode, {}, '', endpoint),
              )
            : Promise.resolve({ statusCode: 201, body: '', headers: {} }),
        );

        await service.notifyMessage(recipientId, () =>
          Promise.resolve(content),
        );

        expect(pushSubscriptionModelMock.deleteOne).toHaveBeenCalledTimes(1);
        expect(pushSubscriptionModelMock.deleteOne).toHaveBeenCalledWith({
          _id: gone._id,
        });
      },
    );

    it('keeps the subscription and does not throw on other failures', async () => {
      findReturns([subscription('https://push.example.com/abc', 'es')]);
      sendNotificationMock.mockRejectedValue(
        new WebPushError(
          'Server error',
          500,
          {},
          '',
          'https://push.example.com/abc',
        ),
      );

      await expect(
        service.notifyMessage(recipientId, () => Promise.resolve(content)),
      ).resolves.toBeUndefined();
      expect(pushSubscriptionModelMock.deleteOne).not.toHaveBeenCalled();
    });

    it('does not throw when the database fails', async () => {
      pushSubscriptionModelMock.find.mockReturnValue({
        exec: jest.fn().mockRejectedValue(new Error('connection lost')),
      });

      await expect(
        service.notifyMessage(recipientId, () => Promise.resolve(content)),
      ).resolves.toBeUndefined();
    });
  });

  describe('when not configured', () => {
    let service: PushService;

    beforeEach(async () => {
      service = await createService({});
    });

    it('skips sending without touching the database', async () => {
      await service.notifyMessage(recipientId, () => Promise.resolve(content));

      expect(pushSubscriptionModelMock.find).not.toHaveBeenCalled();
      expect(sendNotificationMock).not.toHaveBeenCalled();
    });

    it('rejects the endpoints with 503', async () => {
      expect(() => service.getPublicKey()).toThrow(ServiceUnavailableException);
      await expect(
        service.subscribe(jwtPayload, {
          endpoint: 'https://push.example.com/abc',
          keys: { p256dh: 'p', auth: 'a' },
          locale: 'es',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
      await expect(
        service.unsubscribe(jwtPayload, {
          endpoint: 'https://push.example.com/abc',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('treats invalid VAPID keys as not configured', async () => {
      jest.mocked(setVapidDetails).mockImplementationOnce(() => {
        throw new Error('Vapid public key should be 65 bytes long');
      });
      const invalid = await createService(vapidConfig);

      expect(invalid.enabled).toBe(false);
    });
  });
});
