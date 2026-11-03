import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../../users/services/users.service';
import {
  gardenDtoMock,
  gardenEntityMock,
} from '../entities/__fixtures__/gardens-mock';
import { Conversation } from '../../conversations/entities/conversation.entity';
import { Garden } from '../entities/garden.entity';
import { GardensService } from './gardens.service';

const owner = {
  id: gardenEntityMock.ownerId,
  email: 'juan.perez@example.com',
  name: 'Juan Pérez',
};
const ownerPayload = { sub: owner.id, email: owner.email };
const strangerPayload = {
  sub: '64b7f0c2a1b2c3d4e5f60799',
  email: 'stranger@example.com',
};

const polygon =
  '[[-71.68216466903688,-35.42395867605907],[-71.65750980377199,-35.42395867605907],[-71.65750980377199,-35.43847037153734],[-71.68216466903688,-35.43847037153734],[-71.68216466903688,-35.42395867605907]]';

const publicGardenDto = {
  ...gardenDtoMock,
  owner: { name: gardenDtoMock.owner.name },
};

const newGarden = {
  name: 'Jardin 1',
  products: [{ name: 'Lechuga', type: 'vegetable' as const, quantity: 10 }],
  location: { type: 'Point' as const, coordinates: [-71.66, -35.43] },
};

const gardenDocument = () => ({
  ...gardenEntityMock,
  set: jest.fn(),
  save: jest.fn().mockResolvedValue(undefined),
  deleteOne: jest.fn().mockResolvedValue(undefined),
});

const sortedQuery = {
  sort: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([gardenEntityMock]),
};

const gardenModelMock = {
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
};

const conversationModelMock = {
  updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
};

const usersServiceMock = {
  findById: jest.fn(),
  picturesByIds: jest.fn().mockResolvedValue(new Map()),
};

describe('GardensService', () => {
  let service: GardensService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        GardensService,
        {
          provide: getModelToken(Garden.name),
          useValue: gardenModelMock,
        },
        { provide: UsersService, useValue: usersServiceMock },
        {
          provide: getModelToken(Conversation.name),
          useValue: conversationModelMock,
        },
      ],
      controllers: [],
    }).compile();

    service = module.get<GardensService>(GardensService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findGardens', () => {
    beforeEach(() => {
      gardenModelMock.find.mockResolvedValue([gardenEntityMock]);
    });

    it('returns an array of gardens', async () => {
      const result = await service.findGardens(polygon, 'test');

      expect(result).toEqual([publicGardenDto]);
    });

    it("does not expose the owner's email", async () => {
      const [garden] = await service.findGardens(polygon, 'test');

      expect(garden.owner).toEqual({ name: gardenEntityMock.owner.name });
    });

    it("includes the owner's current picture", async () => {
      usersServiceMock.picturesByIds.mockResolvedValueOnce(
        new Map([
          [String(gardenEntityMock.ownerId), 'https://example.com/a.png'],
        ]),
      );

      const [garden] = await service.findGardens(polygon, 'test');

      expect(usersServiceMock.picturesByIds).toHaveBeenCalledWith([
        String(gardenEntityMock.ownerId),
      ]);
      expect(garden.owner.picture).toBe('https://example.com/a.png');
    });

    const polygonFrom = (points: number[][]) => JSON.stringify(points);
    const rectangle = (
      west: number,
      south: number,
      east: number,
      north: number,
    ) =>
      polygonFrom([
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ]);
    const boxesQueried = () => {
      const [filter] = gardenModelMock.find.mock.lastCall as [
        {
          $and: [
            unknown,
            { $or: { location: { $geoWithin: { $box: unknown } } }[] },
            unknown,
          ];
        },
      ];
      return filter.$and[1].$or.map(({ location }) => location.$geoWithin.$box);
    };

    it('queries a small viewport as a single box', async () => {
      await service.findGardens(
        rectangle(-71.69, -35.44, -71.65, -35.42),
        'test',
      );

      expect(boxesQueried()).toEqual([
        [
          [-71.69, -35.44],
          [-71.65, -35.42],
        ],
      ]);
    });

    it('keeps the search filter alongside the location filter', async () => {
      await service.findGardens(
        rectangle(-71.69, -35.44, -71.65, -35.42),
        'tomato',
      );

      const [filter] = gardenModelMock.find.mock.lastCall as [
        { $and: [{ $or: unknown[] }, unknown, unknown] },
      ];
      expect(filter.$and[0].$or).toContainEqual({
        name: { $regex: 'tomato', $options: 'i' },
      });
    });

    it('queries the whole world when the viewport spans 360 degrees or more', async () => {
      await service.findGardens(rectangle(-200, -60, 200, 60), 'test');

      expect(boxesQueried()).toEqual([
        [
          [-180, -60],
          [180, 60],
        ],
      ]);
    });

    it('clamps latitudes to the valid range', async () => {
      await service.findGardens(rectangle(-180, -100, 180, 95), 'test');

      expect(boxesQueried()).toEqual([
        [
          [-180, -90],
          [180, 90],
        ],
      ]);
    });

    it('queries viewports larger than a hemisphere as a flat box', async () => {
      await service.findGardens(rectangle(-120, -60, 120, 60), 'test');

      expect(boxesQueried()).toEqual([
        [
          [-120, -60],
          [120, 60],
        ],
      ]);
    });

    it('splits a viewport crossing the antimeridian into two boxes', async () => {
      await service.findGardens(rectangle(170, -20, 190, 10), 'test');

      expect(boxesQueried()).toEqual([
        [
          [170, -20],
          [180, 10],
        ],
        [
          [-180, -20],
          [-170, 10],
        ],
      ]);
    });

    it('normalizes a viewport wrapped entirely past -180', async () => {
      await service.findGardens(rectangle(-250, 0, -200, 30), 'test');

      expect(boxesQueried()).toEqual([
        [
          [110, 0],
          [160, 30],
        ],
      ]);
    });

    it('raises a bad request if a point is not a pair of numbers', async () => {
      await expect(
        service.findGardens('[[0,0],[1,0],["a",1],[0,0]]', 'test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not search by product type codes', async () => {
      await service.findGardens(polygon, 'vegetable');

      const [filter] = gardenModelMock.find.mock.lastCall as [
        { $and: [{ $or: Record<string, unknown>[] }, unknown, unknown] },
      ];
      expect(
        filter.$and[0].$or.map((clause) => Object.keys(clause)[0]),
      ).toEqual(['name', 'products.name', 'owner.name']);
    });

    it('excludes inactive gardens', async () => {
      await service.findGardens(polygon, 'test');

      const [filter] = gardenModelMock.find.mock.lastCall as [
        { $and: unknown[] },
      ];
      expect(filter.$and).toContainEqual({ active: { $ne: false } });
    });

    it('escapes the search term before using it as a regex', async () => {
      await service.findGardens(polygon, 'a.b(c');

      const [filter] = gardenModelMock.find.mock.lastCall as [
        { $and: [{ $or: unknown[] }, unknown, unknown] },
      ];
      expect(filter.$and[0].$or).toContainEqual({
        name: { $regex: 'a\\.b\\(c', $options: 'i' },
      });
    });

    it('fills defaults for legacy gardens', async () => {
      gardenModelMock.find.mockResolvedValue([
        { ...gardenEntityMock, ownerId: undefined, active: undefined },
      ]);

      const [result] = await service.findGardens(polygon, 'test');

      expect(result).toMatchObject({ active: true, ownerId: null });
    });

    it('raises an error if the polygon is invalid', async () => {
      const result = service.findGardens('invalid', 'test');
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toThrow(
        'Invalid polygon format: SyntaxError: Unexpected token \'i\', "invalid" is not valid JSON',
      );
    });

    it('raises an error if the polygon is not an array', async () => {
      await expect(service.findGardens('{}', 'test')).rejects.toThrow(
        'polygon: an array was expected',
      );
    });

    it('raises an error if the polygon has less than 4 points', async () => {
      await expect(service.findGardens('[[]]', 'test')).rejects.toThrow(
        'polygon: a minimum of 4 points was expected',
      );
    });
  });

  describe('findMine', () => {
    it('returns the gardens of the token subject, most recent first', async () => {
      gardenModelMock.find.mockReturnValue(sortedQuery);

      const result = await service.findMine(ownerPayload);

      expect(gardenModelMock.find).toHaveBeenCalledWith({ ownerId: owner.id });
      expect(sortedQuery.sort).toHaveBeenCalledWith({ updatedAt: -1 });
      expect(result).toEqual([gardenDtoMock]);
    });

    it('returns an empty list for a malformed subject', async () => {
      await expect(
        service.findMine({ sub: 'not-an-id', email: owner.email }),
      ).resolves.toEqual([]);
      expect(gardenModelMock.find).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns the garden with the email to its owner', async () => {
      gardenModelMock.findById.mockResolvedValue(gardenEntityMock);

      await expect(
        service.findById(ownerPayload, gardenEntityMock._id),
      ).resolves.toEqual(gardenDtoMock);
    });

    it("hides the owner's email from other users", async () => {
      gardenModelMock.findById.mockResolvedValue(gardenEntityMock);

      await expect(
        service.findById(strangerPayload, gardenEntityMock._id),
      ).resolves.toEqual(publicGardenDto);
    });

    it('raises NotFound when the garden does not exist', async () => {
      gardenModelMock.findById.mockResolvedValue(null);

      await expect(
        service.findById(ownerPayload, gardenEntityMock._id),
      ).rejects.toThrow(NotFoundException);
    });

    it('raises NotFound for an invalid id', async () => {
      await expect(service.findById(ownerPayload, 'nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(gardenModelMock.findById).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('associates the garden with the authenticated user', async () => {
      usersServiceMock.findById.mockResolvedValue(owner);
      gardenModelMock.create.mockResolvedValue(gardenEntityMock);

      const result = await service.create(ownerPayload, {
        ...newGarden,
        description: undefined,
      });

      expect(usersServiceMock.findById).toHaveBeenCalledWith(owner.id);
      expect(gardenModelMock.create).toHaveBeenCalledWith({
        ...newGarden,
        ownerId: owner.id,
        owner: { name: owner.name, email: owner.email },
      });
      expect(result).toEqual(gardenDtoMock);
    });

    it('falls back to the email when the user has no name', async () => {
      usersServiceMock.findById.mockResolvedValue({
        ...owner,
        name: undefined,
      });
      gardenModelMock.create.mockResolvedValue(gardenEntityMock);

      await service.create(ownerPayload, newGarden);

      expect(gardenModelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: { name: owner.email, email: owner.email },
        }),
      );
    });

    it('rejects when the user no longer exists', async () => {
      usersServiceMock.findById.mockResolvedValue(null);

      await expect(service.create(ownerPayload, newGarden)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(gardenModelMock.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('applies only the provided fields for the owner', async () => {
      const garden = gardenDocument();
      gardenModelMock.findById.mockResolvedValue(garden);

      await service.update(ownerPayload, garden._id, {
        name: 'Nuevo nombre',
        description: undefined,
      });

      expect(garden.set).toHaveBeenCalledWith({ name: 'Nuevo nombre' });
      expect(garden.save).toHaveBeenCalled();
    });

    it('raises Forbidden for another user', async () => {
      const garden = gardenDocument();
      gardenModelMock.findById.mockResolvedValue(garden);

      await expect(
        service.update(strangerPayload, garden._id, { name: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      expect(garden.save).not.toHaveBeenCalled();
    });

    it('raises NotFound when the garden does not exist', async () => {
      gardenModelMock.findById.mockResolvedValue(null);

      await expect(
        service.update(ownerPayload, gardenEntityMock._id, { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the garden for the owner', async () => {
      const garden = gardenDocument();
      gardenModelMock.findById.mockResolvedValue(garden);

      await service.remove(ownerPayload, garden._id);

      expect(garden.deleteOne).toHaveBeenCalled();
    });

    it('leaves its conversations read-only', async () => {
      const garden = gardenDocument();
      gardenModelMock.findById.mockResolvedValue(garden);

      await service.remove(ownerPayload, garden._id);

      expect(conversationModelMock.updateMany).toHaveBeenCalledWith(
        { gardenId: garden._id },
        { $set: { gardenDeleted: true } },
      );
    });

    it('raises Forbidden for another user', async () => {
      const garden = gardenDocument();
      gardenModelMock.findById.mockResolvedValue(garden);

      await expect(service.remove(strangerPayload, garden._id)).rejects.toThrow(
        ForbiddenException,
      );
      expect(garden.deleteOne).not.toHaveBeenCalled();
      expect(conversationModelMock.updateMany).not.toHaveBeenCalled();
    });

    it('raises Forbidden for a legacy garden without owner', async () => {
      const garden = { ...gardenDocument(), ownerId: undefined };
      gardenModelMock.findById.mockResolvedValue(garden);

      await expect(service.remove(ownerPayload, garden._id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
