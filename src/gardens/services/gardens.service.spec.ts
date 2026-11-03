import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import {
  gardenDtoMock,
  gardenEntityMock,
} from '../entities/__fixtures__/gardens-mock';
import { Garden } from '../entities/garden.entity';
import { GardensService } from './gardens.service';

const gardenModelMock = {
  find: jest.fn().mockResolvedValue([gardenEntityMock]),
};

describe('GardensService', () => {
  let service: GardensService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        GardensService,
        {
          provide: getModelToken(Garden.name),
          useValue: gardenModelMock,
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
    it('returns an array of gardens', async () => {
      const result = await service.findGardens(
        '[[-71.68216466903688,-35.42395867605907],[-71.65750980377199,-35.42395867605907],[-71.65750980377199,-35.43847037153734],[-71.68216466903688,-35.43847037153734],[-71.68216466903688,-35.42395867605907]]',
        'test',
      );

      expect(result).toEqual([gardenDtoMock]);
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
        { $and: [{ $or: unknown[] }, unknown] },
      ];
      expect(filter.$and[0].$or).toContainEqual({
        name: { $regex: '.*tomato.*', $options: 'i' },
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
});
