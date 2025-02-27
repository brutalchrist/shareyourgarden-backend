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

    it('raises an error if the polygon is invalid', async () => {
      await expect(service.findGardens('invalid', 'test')).rejects.toThrow(
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
