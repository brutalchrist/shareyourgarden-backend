import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { generateVAPIDKeys, sendNotification } from 'web-push';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { ConversationsModule } from './../src/conversations/conversations.module';
import { PushModule } from './../src/push/push.module';

jest.mock('web-push', () => ({
  ...jest.requireActual<typeof import('web-push')>('web-push'),
  sendNotification: jest.fn(),
}));

const sendNotificationMock = jest.mocked(sendNotification);

// Runs against a real MongoDB, for the unique endpoint index and the push
// sent when a message is saved. The database is dropped before every test.
const MONGODB_URI =
  process.env.MONGODB_TEST_URI ??
  'mongodb://localhost:27017/shareyourgarden-test-push';

interface TestUser {
  id: string;
  token: string;
}

describe('Push (e2e)', () => {
  const vapidKeys = generateVAPIDKeys();
  let app: INestApplication<App>;
  let connection: Connection;
  let jwtService: JwtService;
  let alice: TestUser;
  let bob: TestUser;
  let garden: string;

  const server = () => app.getHttpServer();
  const auth = (user: TestUser) => `Bearer ${user.token}`;

  const insertUser = async (fields: Record<string, unknown>) => {
    const _id = new Types.ObjectId();
    await connection.collection('users').insertOne({
      _id,
      googleId: `google-${String(_id)}`,
      ...fields,
    });
    return {
      id: String(_id),
      token: jwtService.sign({ sub: String(_id), email: fields.email }),
    };
  };

  const subscribe = (user: TestUser, endpoint: string, locale = 'es') =>
    request(server())
      .post('/push/subscriptions')
      .set('Authorization', auth(user))
      .send({
        endpoint,
        keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` },
        locale,
      })
      .expect(204);

  const subscriptions = () =>
    connection.collection('pushsubscriptions').find().toArray();

  // Pushes go out after the response, so wait for them.
  const waitForPushes = async (count: number) => {
    for (let i = 0; i < 50; i++) {
      if (sendNotificationMock.mock.calls.length >= count) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Expected ${count} pushes`);
  };

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
              VAPID_PUBLIC_KEY: vapidKeys.publicKey,
              VAPID_PRIVATE_KEY: vapidKeys.privateKey,
              VAPID_SUBJECT: 'mailto:admin@example.com',
            }),
          ],
        }),
        // Fail fast instead of retrying forever when no database is running.
        MongooseModule.forRoot(MONGODB_URI, {
          serverSelectionTimeoutMS: 5000,
          retryAttempts: 0,
        }),
        ConversationsModule,
        PushModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    connection = moduleFixture.get(getConnectionToken());
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await connection?.dropDatabase();
    await app?.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    sendNotificationMock.mockResolvedValue({
      statusCode: 201,
      body: '',
      headers: {},
    });
    await connection.dropDatabase();
    await Promise.all(
      Object.values(connection.models).map((model) => model.syncIndexes()),
    );

    alice = await insertUser({ email: 'alice@example.com', name: 'Alice' });
    bob = await insertUser({ email: 'bob@example.com', name: 'Bob' });
    const _id = new Types.ObjectId();
    await connection.collection('gardens').insertOne({
      _id,
      ownerId: new Types.ObjectId(alice.id),
      name: 'Huerta Norte',
      active: true,
      products: [],
      owner: { name: 'Alice', email: 'alice@example.com' },
      location: { type: 'Point', coordinates: [-71.66, -35.43] },
    });
    garden = String(_id);
  });

  it('GET /push/public-key returns the VAPID public key', async () => {
    const response = await request(server())
      .get('/push/public-key')
      .expect(200);

    expect(response.body).toEqual({ publicKey: vapidKeys.publicKey });
  });

  it('requires authentication to subscribe', async () => {
    await request(server()).post('/push/subscriptions').send({}).expect(401);
  });

  it('reassigns an endpoint to whoever subscribes from it last', async () => {
    await subscribe(alice, 'https://push.example.com/device', 'es');
    await subscribe(bob, 'https://push.example.com/device', 'en');

    const stored = await subscriptions();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      user: new Types.ObjectId(bob.id),
      locale: 'en',
    });
  });

  it("only deletes the current user's subscription", async () => {
    await subscribe(alice, 'https://push.example.com/device');

    await request(server())
      .delete('/push/subscriptions')
      .set('Authorization', auth(bob))
      .send({ endpoint: 'https://push.example.com/device' })
      .expect(204);
    expect(await subscriptions()).toHaveLength(1);

    await request(server())
      .delete('/push/subscriptions')
      .set('Authorization', auth(alice))
      .send({ endpoint: 'https://push.example.com/device' })
      .expect(204);
    expect(await subscriptions()).toHaveLength(0);
  });

  it('notifies the recipient, not the sender, without the message text', async () => {
    await subscribe(alice, 'https://push.example.com/alice-phone', 'es');
    await subscribe(alice, 'https://push.example.com/alice-laptop', 'en');
    await subscribe(bob, 'https://push.example.com/bob-phone', 'es');

    const conversation = (
      await request(server())
        .post('/conversations')
        .set('Authorization', auth(bob))
        .send({ gardenId: garden, body: 'Hola, ¿cambiamos tomates?' })
        .expect(201)
    ).body as { id: string };
    await waitForPushes(2);

    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    const sent = sendNotificationMock.mock.calls.map(([target, payload]) => ({
      endpoint: target.endpoint,
      payload: JSON.parse(payload as string) as unknown,
    }));
    const expected = {
      type: 'message',
      conversationId: conversation.id,
      senderName: 'Bob',
      gardenName: 'Huerta Norte',
      unread: 1,
    };
    expect(sent).toEqual(
      expect.arrayContaining([
        {
          endpoint: 'https://push.example.com/alice-phone',
          payload: { ...expected, locale: 'es' },
        },
        {
          endpoint: 'https://push.example.com/alice-laptop',
          payload: { ...expected, locale: 'en' },
        },
      ]),
    );
    expect(sendNotificationMock.mock.calls[0][2]).toEqual({
      TTL: 86400,
      urgency: 'normal',
      topic: conversation.id,
    });
  });

  it('still saves the message when the push service fails', async () => {
    await subscribe(alice, 'https://push.example.com/alice-phone');
    sendNotificationMock.mockRejectedValue(new Error('network down'));

    await request(server())
      .post('/conversations')
      .set('Authorization', auth(bob))
      .send({ gardenId: garden, body: 'Hola' })
      .expect(201);
    await waitForPushes(1);

    expect(await connection.collection('messages').countDocuments()).toBe(1);
  });
});
