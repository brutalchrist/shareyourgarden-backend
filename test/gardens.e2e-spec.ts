import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Mongoose, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { Conversation } from './../src/conversations/entities/conversation.entity';
import { Garden, GardenSchema } from './../src/gardens/entities/garden.entity';
import { GardensModule } from './../src/gardens/gardens.module';
import { approximateCoordinates } from './../src/gardens/location-privacy';
import { Upload } from './../src/uploads/entities/upload.entity';
import { User } from './../src/users/entities/user.entity';
import { UsersService } from './../src/users/services/users.service';

const users = {
  alice: {
    id: '64b7f0c2a1b2c3d4e5f60718',
    email: 'alice@example.com',
    name: 'Alice',
  },
  bob: { id: '64b7f0c2a1b2c3d4e5f60719', email: 'bob@example.com' },
};

const usersServiceMock = {
  findById: jest.fn((id: string) =>
    Promise.resolve(
      Object.values(users).find((user) => user.id === id) ?? null,
    ),
  ),
  picturesByIds: jest.fn(() => Promise.resolve(new Map<string, string>())),
};

type Filter = Record<string, unknown>;

// Unconnected model used only to cast filters and documents exactly as
// Mongoose would, so type mismatches (e.g. string vs ObjectId) surface here.
const castingModel = new Mongoose().model(Garden.name, GardenSchema);

const isSameValue = (value: unknown, expected: unknown) =>
  value instanceof Types.ObjectId && expected instanceof Types.ObjectId
    ? value.equals(expected)
    : value === expected;
type Regex = { $regex: string; $options: string };

const valuesAt = (doc: unknown, path: string): unknown[] =>
  path.split('.').reduce<unknown[]>(
    (values, key) =>
      values.flatMap((value) => {
        const next = (value as Record<string, unknown> | undefined)?.[key];
        return Array.isArray(next) ? (next as unknown[]) : [next];
      }),
    [doc],
  );

// Evaluates the subset of MongoDB filters used by GardensService. Geo
// operators are ignored: every stored garden is inside the test polygon.
const matches = (doc: Record<string, unknown>, filter: Filter): boolean =>
  Object.entries(filter).every(([key, condition]) => {
    if (key === '$and') {
      return (condition as Filter[]).every((sub) => matches(doc, sub));
    }
    if (key === '$or') {
      return (condition as Filter[]).some((sub) => matches(doc, sub));
    }
    if (key === 'location.coordinates') {
      return true;
    }
    const values = valuesAt(doc, key);
    if (condition && typeof condition === 'object' && '$ne' in condition) {
      return values.every((value) => !isSameValue(value, condition.$ne));
    }
    if (condition && typeof condition === 'object' && '$regex' in condition) {
      const { $regex, $options } = condition as Regex;
      const regex = new RegExp($regex, $options);
      return values.some(
        (value) => typeof value === 'string' && regex.test(value),
      );
    }
    return values.some((value) => isSameValue(value, condition));
  });

// In-memory stand-in for the Garden Mongoose model.
class FakeGardenModel {
  docs: Record<string, any>[] = [];
  private clock = Date.now();

  private tick() {
    return new Date((this.clock += 1000));
  }

  private toDocument(data: Record<string, unknown>) {
    const doc: Record<string, any> = {
      _id: new Types.ObjectId(),
      ...data,
      set: (fields: object) => {
        Object.assign(doc, JSON.parse(JSON.stringify(fields)) as object);
      },
      save: () => {
        doc.updatedAt = this.tick();
        return Promise.resolve(doc);
      },
      deleteOne: () => {
        this.docs = this.docs.filter((other) => other !== doc);
        return Promise.resolve();
      },
    };
    return doc;
  }

  // Writes straight to the "collection", bypassing schema casting.
  insertRaw(data: Record<string, unknown>) {
    this.docs.push(this.toDocument(data));
  }

  create(data: Record<string, unknown>) {
    const createdAt = this.tick();
    const doc = this.toDocument({
      ...new castingModel(data).toObject(),
      createdAt,
      updatedAt: createdAt,
    });
    this.docs.push(doc);
    return Promise.resolve(doc);
  }

  findById(id: string) {
    return Promise.resolve(
      this.docs.find((doc) => String(doc._id) === id) ?? null,
    );
  }

  find(filter: Filter) {
    const casted = castingModel.find(filter).cast() as Filter;
    let results = this.docs.filter((doc) => matches(doc, casted));
    const query = {
      sort: (spec: Record<string, 1 | -1>) => {
        const [[field, direction]] = Object.entries(spec);
        results = [...results].sort(
          (a, b) => (a[field] - b[field]) * direction,
        );
        return query;
      },
      exec: () => Promise.resolve(results),
      then: (resolve: (value: unknown) => unknown) => resolve(results),
    };
    return query;
  }
}

const polygon = JSON.stringify([
  [-71.7, -35.4],
  [-71.6, -35.4],
  [-71.6, -35.5],
  [-71.7, -35.5],
  [-71.7, -35.4],
]);

const gardenBody = {
  name: 'Huerto Talca',
  description: 'Tomates y lechugas',
  products: [
    { name: 'Tomate', type: 'vegetable', quantity: 3, unit: 'kg' },
    { name: 'Menta', type: 'herb', quantity: 0 },
  ],
  location: { type: 'Point', coordinates: [-71.66, -35.43] },
};

interface GardenResponse {
  id: string;
  name: string;
  active: boolean;
  ownerId: string;
  owner: { name: string; email: string };
  products: { unit?: string }[];
  location: { type: 'Point'; coordinates: number[] };
}

// What anyone but the owner sees of a garden's location.
const approximate = (location: GardenResponse['location']) => ({
  ...location,
  coordinates: approximateCoordinates(location.coordinates),
});

// Conversations are covered by their own suite; here only the call that
// closes them when a garden is deleted matters.
const conversationModel = {
  updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
};

describe('GardensController (e2e)', () => {
  let app: INestApplication<App>;
  let gardenModel: FakeGardenModel;
  let alice: { id: string; token: string };
  let bob: { id: string; token: string };

  const server = () => app.getHttpServer();
  const auth = (user: { token: string }) => `Bearer ${user.token}`;
  const createGarden = async (user: { token: string }, body = gardenBody) =>
    (
      await request(server())
        .post('/gardens')
        .set('Authorization', auth(user))
        .send(body)
        .expect(201)
    ).body as GardenResponse;

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
        GardensModule,
      ],
    })
      .overrideProvider(getModelToken(Garden.name))
      .useFactory({ factory: () => new FakeGardenModel() })
      .overrideProvider(getModelToken(User.name))
      .useValue({})
      .overrideProvider(getModelToken(Conversation.name))
      .useValue(conversationModel)
      // No S3_* variables are configured, so photos are disabled and the
      // upload records are never read.
      .overrideProvider(getModelToken(Upload.name))
      .useValue({})
      .overrideProvider(UsersService)
      .useValue(usersServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    gardenModel = moduleFixture.get(getModelToken(Garden.name));
    const jwtService = moduleFixture.get(JwtService);
    const login = (user: { id: string; email: string }) => ({
      id: user.id,
      token: jwtService.sign({ sub: user.id, email: user.email }),
    });
    alice = login(users.alice);
    bob = login(users.bob);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    gardenModel.docs = [];
    conversationModel.updateMany.mockClear();
  });

  describe('POST /gardens', () => {
    it('creates a garden owned by the authenticated user', async () => {
      const garden = await createGarden(alice, {
        ...gardenBody,
        ownerId: bob.id,
        owner: { name: 'Mallory', email: 'mallory@example.com' },
      } as typeof gardenBody);

      expect(garden).toMatchObject({
        name: gardenBody.name,
        description: gardenBody.description,
        active: true,
        ownerId: alice.id,
        owner: { name: 'Alice', email: 'alice@example.com' },
        location: gardenBody.location,
        products: [
          { name: 'Tomate', type: 'vegetable', quantity: 3, unit: 'kg' },
          { name: 'Menta', type: 'herb', quantity: 0 },
        ],
      });
      expect(garden.id).toEqual(expect.any(String));
    });

    it('answers 503 for new photos when storage is not configured', async () => {
      const response = await request(server())
        .post('/gardens')
        .set('Authorization', auth(alice))
        .send({
          ...gardenBody,
          products: [
            {
              name: 'Tomate',
              type: 'vegetable',
              quantity: 3,
              images: [{ id: randomUUID() }],
            },
          ],
        })
        .expect(503);

      expect(response.body).toMatchObject({ code: 'IMAGES_DISABLED' });
      expect(gardenModel.docs).toHaveLength(0);
    });

    it('returns products without photos as an empty list', async () => {
      const garden = await createGarden(alice);

      expect(garden.products).toEqual([
        expect.objectContaining({ name: 'Tomate', images: [] }),
        expect.objectContaining({ name: 'Menta', images: [] }),
      ]);
    });

    it('uses the email as owner name when the user has none', async () => {
      const garden = await createGarden(bob);

      expect(garden.owner).toEqual({
        name: 'bob@example.com',
        email: 'bob@example.com',
      });
    });

    it('returns 401 without a token', () => {
      return request(server()).post('/gardens').send(gardenBody).expect(401);
    });

    it.each([
      ['missing name', { ...gardenBody, name: undefined }],
      ['empty name', { ...gardenBody, name: '' }],
      ['long name', { ...gardenBody, name: 'x'.repeat(81) }],
      ['long description', { ...gardenBody, description: 'x'.repeat(501) }],
      ['missing products', { ...gardenBody, products: undefined }],
      [
        'too many products',
        { ...gardenBody, products: Array(51).fill(gardenBody.products[0]) },
      ],
      [
        'negative quantity',
        {
          ...gardenBody,
          products: [{ name: 'A', type: 'fruit', quantity: -1 }],
        },
      ],
      [
        'unknown product type',
        {
          ...gardenBody,
          products: [{ name: 'A', type: 'Verdura', quantity: 1 }],
        },
      ],
      [
        'unknown product unit',
        {
          ...gardenBody,
          products: [{ name: 'A', type: 'fruit', quantity: 1, unit: 'kilos' }],
        },
      ],
      [
        'empty product type',
        { ...gardenBody, products: [{ name: 'A', type: '', quantity: 1 }] },
      ],
      [
        'string quantity',
        {
          ...gardenBody,
          products: [{ name: 'A', type: 'fruit', quantity: '1' }],
        },
      ],
      [
        'more than 3 photos in a product',
        {
          ...gardenBody,
          products: [
            {
              name: 'A',
              type: 'fruit',
              quantity: 1,
              images: Array.from({ length: 4 }, () => ({ id: randomUUID() })),
            },
          ],
        },
      ],
      [
        'a photo id that is not a UUID',
        {
          ...gardenBody,
          products: [
            { name: 'A', type: 'fruit', quantity: 1, images: [{ id: 'x' }] },
          ],
        },
      ],
      [
        'non Point location',
        { ...gardenBody, location: { type: 'Polygon', coordinates: [0, 0] } },
      ],
      [
        'three coordinates',
        { ...gardenBody, location: { type: 'Point', coordinates: [0, 0, 0] } },
      ],
      [
        'longitude out of range',
        { ...gardenBody, location: { type: 'Point', coordinates: [181, 0] } },
      ],
      [
        'latitude out of range',
        { ...gardenBody, location: { type: 'Point', coordinates: [0, -91] } },
      ],
      ['missing location', { ...gardenBody, location: undefined }],
    ])('returns 400 for %s', (_, body) => {
      return request(server())
        .post('/gardens')
        .set('Authorization', auth(alice))
        .send(body)
        .expect(400);
    });
  });

  describe('GET /gardens/mine', () => {
    it("returns only the user's gardens, most recently updated first", async () => {
      const first = await createGarden(alice, { ...gardenBody, name: 'First' });
      const second = await createGarden(alice, {
        ...gardenBody,
        name: 'Second',
      });
      await createGarden(bob);
      await request(server())
        .patch(`/gardens/${first.id}`)
        .set('Authorization', auth(alice))
        .send({ description: 'Touched' })
        .expect(200);

      const response = await request(server())
        .get('/gardens/mine')
        .set('Authorization', auth(alice))
        .expect(200);

      const gardens = response.body as GardenResponse[];
      expect(gardens.map((garden) => garden.id)).toEqual([first.id, second.id]);
    });

    it('returns gardens whose ownerId was stored as an ObjectId', async () => {
      const _id = new Types.ObjectId();
      gardenModel.insertRaw({
        _id,
        ownerId: new Types.ObjectId(alice.id),
        name: 'Stored directly',
        products: [],
        owner: { name: 'Alice', email: users.alice.email },
        location: { type: 'Point', coordinates: [-71.66, -35.43] },
      });

      const mine = await request(server())
        .get('/gardens/mine')
        .set('Authorization', auth(alice))
        .expect(200);
      expect((mine.body as GardenResponse[]).map((g) => g.id)).toEqual([
        String(_id),
      ]);

      await request(server())
        .patch(`/gardens/${String(_id)}`)
        .set('Authorization', auth(alice))
        .send({ name: 'Renamed' })
        .expect(200);
      await request(server())
        .delete(`/gardens/${String(_id)}`)
        .set('Authorization', auth(alice))
        .expect(204);
      expect(gardenModel.docs).toHaveLength(0);
    });

    it('returns 401 without a token', () => {
      return request(server()).get('/gardens/mine').expect(401);
    });
  });

  describe('GET /gardens/:id', () => {
    it('returns the garden to its owner', async () => {
      const garden = await createGarden(alice);

      const response = await request(server())
        .get(`/gardens/${garden.id}`)
        .set('Authorization', auth(alice))
        .expect(200);

      expect(response.body).toEqual(garden);
    });

    it("hides the owner's email from other users", async () => {
      const garden = await createGarden(alice);

      const response = await request(server())
        .get(`/gardens/${garden.id}`)
        .set('Authorization', auth(bob))
        .expect(200);

      expect(response.body).toEqual({
        ...garden,
        owner: { name: 'Alice' },
        location: approximate(garden.location),
      });
    });

    it('returns 404 for an unknown or invalid id', async () => {
      await request(server())
        .get('/gardens/64b7f0c2a1b2c3d4e5f60718')
        .set('Authorization', auth(alice))
        .expect(404, {
          statusCode: 404,
          message: 'Garden not found',
          error: 'Not Found',
          code: 'GARDEN_NOT_FOUND',
        });
      await request(server())
        .get('/gardens/not-an-id')
        .set('Authorization', auth(alice))
        .expect(404);
    });
  });

  describe('PATCH /gardens/:id', () => {
    it('updates the provided fields for the owner', async () => {
      const garden = await createGarden(alice);

      const response = await request(server())
        .patch(`/gardens/${garden.id}`)
        .set('Authorization', auth(alice))
        .send({ name: 'Renamed', active: false, ownerId: bob.id })
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Renamed',
        active: false,
        ownerId: alice.id,
        description: gardenBody.description,
        products: garden.products,
      });
    });

    it('returns 403 for another user', async () => {
      const garden = await createGarden(alice);

      await request(server())
        .patch(`/gardens/${garden.id}`)
        .set('Authorization', auth(bob))
        .send({ name: 'Hijacked' })
        .expect(403);
    });

    it('returns 404 when the garden does not exist', () => {
      return request(server())
        .patch('/gardens/64b7f0c2a1b2c3d4e5f60718')
        .set('Authorization', auth(alice))
        .send({ name: 'Ghost' })
        .expect(404);
    });

    it('returns 400 for invalid fields', async () => {
      const garden = await createGarden(alice);

      await request(server())
        .patch(`/gardens/${garden.id}`)
        .set('Authorization', auth(alice))
        .send({ name: null })
        .expect(400);
    });
  });

  describe('DELETE /gardens/:id', () => {
    it('deletes the garden for the owner', async () => {
      const garden = await createGarden(alice);

      await request(server())
        .delete(`/gardens/${garden.id}`)
        .set('Authorization', auth(alice))
        .expect(204);

      expect(gardenModel.docs).toHaveLength(0);
      const [[filter, update]] = conversationModel.updateMany.mock
        .calls as unknown as [[{ gardenId: Types.ObjectId }, unknown]];
      expect(String(filter.gardenId)).toBe(garden.id);
      expect(update).toEqual({ $set: { gardenDeleted: true } });
    });

    it('returns 403 for another user', async () => {
      const garden = await createGarden(alice);

      await request(server())
        .delete(`/gardens/${garden.id}`)
        .set('Authorization', auth(bob))
        .expect(403);

      expect(gardenModel.docs).toHaveLength(1);
    });

    it('returns 404 when the garden does not exist', () => {
      return request(server())
        .delete('/gardens/64b7f0c2a1b2c3d4e5f60718')
        .set('Authorization', auth(alice))
        .expect(404);
    });
  });

  describe('GET /gardens', () => {
    it('excludes inactive gardens and keeps legacy ones', async () => {
      const visible = await createGarden(alice, {
        ...gardenBody,
        name: 'Visible',
      });
      await createGarden(alice, {
        ...gardenBody,
        name: 'Hidden',
        active: false,
      } as typeof gardenBody);
      // Legacy document written before ownerId/active existed.
      gardenModel.insertRaw({
        name: 'Legacy',
        products: [],
        owner: { name: 'Old', email: 'old@example.com' },
        location: { type: 'Point', coordinates: [-71.65, -35.45] },
      });

      const response = await request(server())
        .get('/gardens')
        .query({ polygon })
        .expect(200);

      const gardens = response.body as GardenResponse[];
      expect(gardens.map((garden) => garden.name).sort()).toEqual([
        'Legacy',
        'Visible',
      ]);
      // The public list never carries the owner's email.
      expect(gardens.find((garden) => garden.id === visible.id)).toEqual({
        ...visible,
        location: approximate(visible.location),
        owner: { name: 'Alice' },
      });
      expect(gardens.every((garden) => !('email' in garden.owner))).toBe(true);
      expect(gardens.find((garden) => garden.name === 'Legacy')).toMatchObject({
        active: true,
        ownerId: null,
      });
    });

    it('treats the search term literally', async () => {
      await createGarden(alice, { ...gardenBody, name: 'Huerto (norte)' });
      await createGarden(alice, { ...gardenBody, name: 'Huerto norte' });

      const response = await request(server())
        .get('/gardens')
        .query({ polygon, where: '(norte)' })
        .expect(200);

      const gardens = response.body as GardenResponse[];
      expect(gardens.map((garden) => garden.name)).toEqual(['Huerto (norte)']);
    });
  });
});
