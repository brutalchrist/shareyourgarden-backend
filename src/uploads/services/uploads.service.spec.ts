import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { StorageService } from '../../storage/storage.service';
import { Upload } from '../entities/upload.entity';
import { MAX_UPLOADS_PER_HOUR } from '../uploads.constants';
import { UploadsService } from './uploads.service';

const user = { sub: '64b7f0c2a1b2c3d4e5f60718', email: 'ana@example.com' };

const body = {
  contentType: 'image/webp' as const,
  fullSize: 180_000,
  thumbSize: 20_000,
  width: 1600,
  height: 1200,
};

const uploadModelMock = {
  create: jest.fn(),
  countDocuments: jest.fn(),
  find: jest.fn(),
  updateMany: jest.fn(),
};

const storageMock = {
  assertEnabled: jest.fn(),
  presignPut: jest.fn(
    (key: string, type: string, size: number) =>
      `https://bucket.test/${key}?type=${type}&size=${size}`,
  ),
  publicUrl: jest.fn((key: string) => `https://img.test/${key}`),
};

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    storageMock.assertEnabled.mockReset();
    uploadModelMock.countDocuments.mockResolvedValue(0);
    uploadModelMock.create.mockResolvedValue({});
    uploadModelMock.find.mockResolvedValue([]);
    uploadModelMock.updateMany.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: getModelToken(Upload.name), useValue: uploadModelMock },
        { provide: StorageService, useValue: storageMock },
      ],
    }).compile();

    service = module.get(UploadsService);
  });

  describe('createImageUpload', () => {
    it('reserves an id and signs both files under tmp/', async () => {
      const result = await service.createImageUpload(user, body);

      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(uploadModelMock.create).toHaveBeenCalledWith({
        imageId: result.id,
        userId: new Types.ObjectId(user.sub),
        contentType: 'image/webp',
        width: 1600,
        height: 1200,
      });
      expect(storageMock.presignPut).toHaveBeenCalledWith(
        `tmp/${result.id}/full`,
        'image/webp',
        180_000,
      );
      expect(storageMock.presignPut).toHaveBeenCalledWith(
        `tmp/${result.id}/thumb`,
        'image/webp',
        20_000,
      );
      expect(result).toEqual({
        id: result.id,
        full: {
          url: expect.stringContaining(`tmp/${result.id}/full`) as unknown,
          headers: { 'Content-Type': 'image/webp' },
        },
        thumb: {
          url: expect.stringContaining(`tmp/${result.id}/thumb`) as unknown,
          headers: { 'Content-Type': 'image/webp' },
        },
        previewUrl: `https://img.test/tmp/${result.id}/thumb`,
      });
    });

    it('gives a different id to every upload', async () => {
      const first = await service.createImageUpload(user, body);
      const second = await service.createImageUpload(user, body);

      expect(first.id).not.toEqual(second.id);
    });

    it(`allows at most ${MAX_UPLOADS_PER_HOUR} uploads per hour`, async () => {
      uploadModelMock.countDocuments.mockResolvedValue(MAX_UPLOADS_PER_HOUR);

      await expect(service.createImageUpload(user, body)).rejects.toMatchObject(
        {
          status: 429,
          response: { code: 'TOO_MANY_UPLOADS' },
        },
      );
      expect(uploadModelMock.create).not.toHaveBeenCalled();
    });

    it('answers 503 when storage is not configured', async () => {
      storageMock.assertEnabled.mockImplementation(() => {
        throw new ServiceUnavailableException();
      });

      await expect(service.createImageUpload(user, body)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(uploadModelMock.create).not.toHaveBeenCalled();
    });

    it('rejects a malformed token subject', async () => {
      await expect(
        service.createImageUpload({ ...user, sub: 'nope' }, body),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('findClaimable', () => {
    it("only looks for the user's unclaimed uploads", async () => {
      uploadModelMock.find.mockResolvedValue([{ imageId: 'a' }]);

      const result = await service.findClaimable(user, ['a', 'b']);

      expect(uploadModelMock.find).toHaveBeenCalledWith({
        imageId: { $in: ['a', 'b'] },
        userId: new Types.ObjectId(user.sub),
        gardenId: null,
      });
      expect([...result.keys()]).toEqual(['a']);
    });

    it('skips the query when there is nothing to look for', async () => {
      await service.findClaimable(user, []);

      expect(uploadModelMock.find).not.toHaveBeenCalled();
    });
  });

  describe('markClaimed', () => {
    it('ties the uploads to the garden', async () => {
      const gardenId = new Types.ObjectId();

      await service.markClaimed(['a'], gardenId);

      expect(uploadModelMock.updateMany).toHaveBeenCalledWith(
        { imageId: { $in: ['a'] } },
        { $set: { gardenId } },
      );
    });
  });
});
