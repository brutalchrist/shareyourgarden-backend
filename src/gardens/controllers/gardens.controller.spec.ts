import { Test, TestingModule } from '@nestjs/testing';
import { gardenDtoMock } from '../entities/__fixtures__/gardens-mock';
import { GardensService } from '../services/gardens.service';
import { GardensController } from './gardens.controller';

const mockGardensService = {
  findGardens: jest.fn().mockResolvedValue([gardenDtoMock]),
};

describe('GardensController', () => {
  let controller: GardensController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GardensController],
      providers: [
        {
          provide: GardensService,
          useValue: mockGardensService,
        },
      ],
    }).compile();

    controller = module.get<GardensController>(GardensController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findGardens', () => {
    const polygon =
      '[[-71.68216466903688,-35.42395867605907],[-71.65750980377199,-35.42395867605907],[-71.65750980377199,-35.43847037153734],[-71.68216466903688,-35.43847037153734],[-71.68216466903688,-35.42395867605907]]';
    it('should return an array of gardens', async () => {
      const result = await controller.findGardens(polygon, 'test');

      expect(result).toBeInstanceOf(Array);
      expect(mockGardensService.findGardens).toHaveBeenCalledWith(
        polygon,
        'test',
      );
    });
  });
});
