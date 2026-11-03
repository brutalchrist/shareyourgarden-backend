import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { ConversationsModule } from './../src/conversations/conversations.module';

// Runs against a real MongoDB (the unique index, upserts and counters are the
// point of these tests). The database is dropped before every test.
const MONGODB_URI =
  process.env.MONGODB_TEST_URI ??
  'mongodb://localhost:27017/shareyourgarden-test-conversations';

interface TestUser {
  id: string;
  token: string;
}

interface ConversationResponse {
  id: string;
  gardenId: string;
  gardenName: string;
  productName?: string;
  role: 'owner' | 'requester';
  otherUser: { id: string; name: string; picture?: string };
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
  otherLastReadAt: string | null;
}

interface MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

describe('ConversationsController (e2e)', () => {
  let app: INestApplication<App>;
  let connection: Connection;
  let jwtService: JwtService;
  // Alice owns the gardens; Bob and Carol write to her.
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let north: string;
  let south: string;

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

  const insertGarden = async (
    owner: TestUser | null,
    fields: Record<string, unknown> = {},
  ) => {
    const _id = new Types.ObjectId();
    await connection.collection('gardens').insertOne({
      _id,
      ...(owner ? { ownerId: new Types.ObjectId(owner.id) } : {}),
      name: 'Huerta',
      active: true,
      products: [{ name: 'Tomate', type: 'vegetable', quantity: 3 }],
      owner: { name: 'Alice', email: 'alice@example.com' },
      location: { type: 'Point', coordinates: [-71.66, -35.43] },
      ...fields,
    });
    return String(_id);
  };

  const start = (user: TestUser, body: Record<string, unknown>, status = 201) =>
    request(server())
      .post('/conversations')
      .set('Authorization', auth(user))
      .send(body)
      .expect(status);

  const startConversation = async (
    user: TestUser,
    gardenId: string,
    body = 'Hola',
  ) => (await start(user, { gardenId, body })).body as ConversationResponse;

  const send = async (user: TestUser, conversationId: string, body: string) =>
    (
      await request(server())
        .post(`/conversations/${conversationId}/messages`)
        .set('Authorization', auth(user))
        .send({ body })
        .expect(201)
    ).body as MessageResponse;

  const get = (user: TestUser, path: string, status = 200) =>
    request(server()).get(path).set('Authorization', auth(user)).expect(status);

  const summary = async (user: TestUser) =>
    (await get(user, '/conversations/summary')).body as {
      unread: number;
      byGarden: Record<string, number>;
    };

  const inbox = async (user: TestUser, query = '') =>
    (await get(user, `/conversations${query}`)).body as {
      conversations: ConversationResponse[];
      hasMore: boolean;
    };

  const messages = async (user: TestUser, id: string, query = '') =>
    (await get(user, `/conversations/${id}/messages${query}`)).body as {
      messages: MessageResponse[];
      hasMore: boolean;
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
            }),
          ],
        }),
        // Fail fast instead of retrying forever when no database is running.
        MongooseModule.forRoot(MONGODB_URI, {
          serverSelectionTimeoutMS: 5000,
          retryAttempts: 0,
        }),
        ConversationsModule,
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
    await connection.dropDatabase();
    // Dropping the database also drops the indexes, the unique one included.
    await Promise.all(
      Object.values(connection.models).map((model) => model.syncIndexes()),
    );

    alice = await insertUser({
      email: 'alice@example.com',
      name: 'Alice',
      picture: 'https://example.com/alice.png',
    });
    bob = await insertUser({ email: 'bob@example.com', name: 'Bob' });
    carol = await insertUser({ email: 'carol@example.com' });
    north = await insertGarden(alice, { name: 'Huerta Norte' });
    south = await insertGarden(alice, { name: 'Huerta Sur' });
  });

  describe('POST /conversations', () => {
    it('starts a conversation with the first message', async () => {
      const response = await start(bob, {
        gardenId: north,
        productName: '  Tomate ',
        body: '  Hola, ¿cambiamos tomates?  ',
      });

      const conversation = response.body as ConversationResponse;
      expect(conversation).toMatchObject({
        gardenId: north,
        gardenName: 'Huerta Norte',
        productName: 'Tomate',
        role: 'requester',
        otherUser: {
          id: alice.id,
          name: 'Alice',
          picture: 'https://example.com/alice.png',
        },
        lastMessage: { body: 'Hola, ¿cambiamos tomates?', senderId: bob.id },
        unreadCount: 0,
        otherLastReadAt: null,
      });

      const page = await messages(bob, conversation.id);
      expect(page.messages.map((message) => message.body)).toEqual([
        'Hola, ¿cambiamos tomates?',
      ]);
    });

    it('reuses the conversation when writing to the same garden again', async () => {
      const first = await startConversation(bob, north, 'Hola');
      const second = (
        await start(bob, {
          gardenId: north,
          productName: 'Lechuga',
          body: '¿Sigue disponible?',
        })
      ).body as ConversationResponse;

      expect(second.id).toBe(first.id);
      expect(second.productName).toBe('Lechuga');
      const page = await messages(bob, first.id);
      expect(page.messages.map((message) => message.body)).toEqual([
        'Hola',
        '¿Sigue disponible?',
      ]);
    });

    it('keeps one conversation when two first messages arrive together', async () => {
      const [first, second] = await Promise.all([
        startConversation(bob, north, 'Uno'),
        startConversation(bob, north, 'Dos'),
      ]);

      expect(first.id).toBe(second.id);
      expect((await messages(bob, first.id)).messages).toHaveLength(2);
      expect((await summary(alice)).byGarden).toEqual({ [north]: 1 });
    });

    // A true race is hard to trigger from a test, so check the index that
    // makes MongoDB resolve it.
    it('stores at most one conversation per garden and requester', async () => {
      const conversation = await startConversation(bob, north);
      const stored = await connection
        .collection('conversations')
        .findOne({ _id: new Types.ObjectId(conversation.id) });

      await expect(
        connection.collection('conversations').insertOne({
          ...stored,
          _id: new Types.ObjectId(),
        }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it('keeps conversations about different gardens apart', async () => {
      const aboutNorth = await startConversation(bob, north);
      const aboutSouth = await startConversation(bob, south);

      expect(aboutNorth.id).not.toBe(aboutSouth.id);
    });

    it('uses the email when the requester has no name', async () => {
      await startConversation(carol, north);

      const [conversation] = (await inbox(alice)).conversations;
      expect(conversation.otherUser).toEqual({
        id: carol.id,
        name: 'carol@example.com',
      });
    });

    it('rejects writing to your own garden', async () => {
      const response = await start(
        alice,
        { gardenId: north, body: 'Hola' },
        400,
      );

      expect(response.body).toMatchObject({
        code: 'CANNOT_CONTACT_OWN_GARDEN',
      });
    });

    it('returns 404 for a hidden, unknown or invalid garden', async () => {
      const hidden = await insertGarden(alice, { active: false });

      for (const gardenId of [hidden, String(new Types.ObjectId())]) {
        const response = await start(bob, { gardenId, body: 'Hola' }, 404);
        expect(response.body).toMatchObject({ code: 'GARDEN_NOT_FOUND' });
      }
    });

    it('returns 409 for a legacy garden without owner', async () => {
      const legacy = await insertGarden(null);

      const response = await start(
        bob,
        { gardenId: legacy, body: 'Hola' },
        409,
      );
      expect(response.body).toMatchObject({ code: 'GARDEN_HAS_NO_OWNER' });
    });

    it.each([
      ['missing body', { body: undefined }],
      ['blank body', { body: '   ' }],
      ['long body', { body: 'x'.repeat(2001) }],
      ['invalid garden id', { gardenId: 'nope' }],
      ['empty product', { productName: '' }],
      ['long product', { productName: 'x'.repeat(61) }],
    ])('returns 400 for %s', async (_, fields) => {
      const response = await start(
        bob,
        { gardenId: north, body: 'Hola', ...fields },
        400,
      );
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('returns 401 without a token', () => {
      return request(server())
        .post('/conversations')
        .send({ gardenId: north, body: 'Hola' })
        .expect(401);
    });
  });

  describe('unread counters', () => {
    it('counts unread conversations per side and per garden', async () => {
      const bobNorth = await startConversation(bob, north);
      await send(bob, bobNorth.id, 'Otro mensaje');
      await startConversation(carol, north);
      await startConversation(carol, south);

      expect(await summary(alice)).toEqual({
        unread: 3,
        byGarden: { [north]: 2, [south]: 1 },
      });
      expect(await summary(bob)).toEqual({ unread: 0, byGarden: {} });

      const [aboutNorth] = (
        await inbox(alice, `?gardenId=${north}`)
      ).conversations.filter((c) => c.otherUser.id === bob.id);
      expect(aboutNorth.unreadCount).toBe(2);
    });

    it('moves the unread count to the other side on reply', async () => {
      const conversation = await startConversation(bob, north);

      await send(alice, conversation.id, 'Sí, claro');

      expect(await summary(alice)).toEqual({ unread: 0, byGarden: {} });
      expect(await summary(bob)).toEqual({ unread: 1, byGarden: {} });
      const bobView = (await get(bob, `/conversations/${conversation.id}`))
        .body as ConversationResponse;
      expect(bobView.unreadCount).toBe(1);
      // Replying means Alice read Bob's message.
      expect(bobView.otherLastReadAt).toEqual(expect.any(String));
    });

    it('clears the count when marked as read', async () => {
      const conversation = await startConversation(bob, north);

      await request(server())
        .post(`/conversations/${conversation.id}/read`)
        .set('Authorization', auth(alice))
        .expect(204);

      expect(await summary(alice)).toEqual({ unread: 0, byGarden: {} });
      const bobView = (await get(bob, `/conversations/${conversation.id}`))
        .body as ConversationResponse;
      expect(bobView.otherLastReadAt).toEqual(expect.any(String));
    });
  });

  describe('GET /conversations', () => {
    it('lists received and sent conversations, latest message first', async () => {
      // Bob owns a garden too, so he has both kinds of conversations.
      const bobsGarden = await insertGarden(bob, { name: 'Huerta de Bob' });
      const sent = await startConversation(bob, north);
      const received = await startConversation(carol, bobsGarden);
      await send(bob, sent.id, 'Más reciente');

      const all = await inbox(bob);
      expect(all.conversations.map((c) => [c.id, c.role])).toEqual([
        [sent.id, 'requester'],
        [received.id, 'owner'],
      ]);
      expect(all.hasMore).toBe(false);

      expect(
        (await inbox(bob, '?role=received')).conversations.map((c) => c.id),
      ).toEqual([received.id]);
      expect(
        (await inbox(bob, '?role=sent')).conversations.map((c) => c.id),
      ).toEqual([sent.id]);
    });

    it('filters by garden', async () => {
      await startConversation(bob, north);
      const aboutSouth = await startConversation(carol, south);

      const page = await inbox(alice, `?gardenId=${south}`);
      expect(page.conversations.map((c) => c.id)).toEqual([aboutSouth.id]);
    });

    it('pages with the last message date as cursor', async () => {
      const first = await startConversation(bob, north);
      const second = await startConversation(carol, north);
      const third = await startConversation(bob, south);

      const page1 = await inbox(alice, '?limit=2');
      expect(page1.conversations.map((c) => c.id)).toEqual([
        third.id,
        second.id,
      ]);
      expect(page1.hasMore).toBe(true);

      const cursor = page1.conversations[1].lastMessage!.createdAt;
      const page2 = await inbox(alice, `?limit=2&before=${cursor}`);
      expect(page2.conversations.map((c) => c.id)).toEqual([first.id]);
      expect(page2.hasMore).toBe(false);
    });

    it("does not list other people's conversations", async () => {
      await startConversation(bob, north);

      expect((await inbox(carol)).conversations).toEqual([]);
    });

    it.each(['?role=mine', '?gardenId=nope', '?before=yesterday', '?limit=0'])(
      'returns 400 for %s',
      (query) => get(alice, `/conversations${query}`, 400),
    );
  });

  describe('GET /conversations/:id', () => {
    it("returns 404 for someone else's, unknown or invalid conversation", async () => {
      const conversation = await startConversation(bob, north);

      for (const id of [
        conversation.id,
        String(new Types.ObjectId()),
        'not-an-id',
      ]) {
        const response = await get(carol, `/conversations/${id}`, 404);
        expect(response.body).toMatchObject({
          code: 'CONVERSATION_NOT_FOUND',
        });
      }
    });

    it('keeps the owner from writing or reading as an outsider', async () => {
      const conversation = await startConversation(bob, north);

      await request(server())
        .post(`/conversations/${conversation.id}/messages`)
        .set('Authorization', auth(carol))
        .send({ body: 'Hola' })
        .expect(404);
      await request(server())
        .post(`/conversations/${conversation.id}/read`)
        .set('Authorization', auth(carol))
        .expect(404);
      await get(carol, `/conversations/${conversation.id}/messages`, 404);
    });
  });

  describe('GET /conversations/:id/messages', () => {
    it('pages history backwards and polls forwards, oldest first', async () => {
      const conversation = await startConversation(bob, north, 'm1');
      const sent: MessageResponse[] = [];
      for (const body of ['m2', 'm3', 'm4', 'm5']) {
        sent.push(
          await send(body === 'm3' ? alice : bob, conversation.id, body),
        );
      }

      const latest = await messages(bob, conversation.id, '?limit=2');
      expect(latest.messages.map((m) => m.body)).toEqual(['m4', 'm5']);
      expect(latest.hasMore).toBe(true);

      const older = await messages(
        bob,
        conversation.id,
        `?limit=2&before=${latest.messages[0].id}`,
      );
      expect(older.messages.map((m) => m.body)).toEqual(['m2', 'm3']);
      expect(older.hasMore).toBe(true);

      const oldest = await messages(
        bob,
        conversation.id,
        `?limit=2&before=${older.messages[0].id}`,
      );
      expect(oldest.messages.map((m) => m.body)).toEqual(['m1']);
      expect(oldest.hasMore).toBe(false);

      const newer = await messages(
        alice,
        conversation.id,
        `?after=${sent[1].id}`,
      );
      expect(newer.messages.map((m) => m.body)).toEqual(['m4', 'm5']);
      expect(newer.hasMore).toBe(false);
      expect(newer.messages[1]).toEqual({
        id: sent[3].id,
        conversationId: conversation.id,
        senderId: bob.id,
        body: 'm5',
        createdAt: sent[3].createdAt,
      });

      const upToDate = await messages(
        alice,
        conversation.id,
        `?after=${sent[3].id}`,
      );
      expect(upToDate.messages).toEqual([]);
    });

    it('returns 400 for a cursor from another conversation', async () => {
      const mine = await startConversation(bob, north);
      const other = await startConversation(carol, north);
      const [foreign] = (await messages(carol, other.id)).messages;

      const response = await get(
        bob,
        `/conversations/${mine.id}/messages?before=${foreign.id}`,
        400,
      );
      expect(response.body).toMatchObject({ code: 'INVALID_MESSAGE_CURSOR' });
    });
  });

  describe('POST /conversations/:id/messages', () => {
    it('updates the last message shown in the inbox', async () => {
      const conversation = await startConversation(bob, north);

      const message = await send(alice, conversation.id, '  Hola Bob  ');

      expect(message).toMatchObject({ senderId: alice.id, body: 'Hola Bob' });
      const [inBobsInbox] = (await inbox(bob)).conversations;
      expect(inBobsInbox.lastMessage).toEqual({
        body: 'Hola Bob',
        senderId: alice.id,
        createdAt: message.createdAt,
      });
    });

    it('returns 400 for a blank message', () => {
      return startConversation(bob, north).then(({ id }) =>
        request(server())
          .post(`/conversations/${id}/messages`)
          .set('Authorization', auth(alice))
          .send({ body: ' ' })
          .expect(400),
      );
    });
  });
});
