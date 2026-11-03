import { UnauthorizedException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Mongoose } from 'mongoose';
import { User, UserSchema } from '../entities/user.entity';
import { UsersService } from './users.service';

const UserModel = new Mongoose().model(User.name, UserSchema);

const userId = '64b7f0c2a1b2c3d4e5f60718';
const jwtPayload = { sub: userId, email: 'jane@example.com' };

const userModelMock = {
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModelMock },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findById', () => {
    it('returns locale null for documents stored before the field existed', async () => {
      // A raw document without `locale`, as older users come back from Mongo.
      userModelMock.findById.mockResolvedValue({
        _id: userId,
        email: 'jane@example.com',
        name: 'Jane Doe',
      });

      await expect(service.findById(userId)).resolves.toEqual({
        id: userId,
        email: 'jane@example.com',
        name: 'Jane Doe',
        picture: undefined,
        locale: null,
      });
    });
  });

  describe('updateMe', () => {
    it.each(['es', 'en', null] as const)(
      'stores locale %p on the signed-in user',
      async (locale) => {
        userModelMock.findByIdAndUpdate.mockResolvedValue(
          new UserModel({
            _id: userId,
            googleId: 'google-123',
            email: 'jane@example.com',
            locale,
          }),
        );

        const result = await service.updateMe(jwtPayload, { locale });

        expect(userModelMock.findByIdAndUpdate).toHaveBeenCalledWith(
          userId,
          { $set: { locale } },
          { returnDocument: 'after', runValidators: true },
        );
        expect(result).toMatchObject({ id: userId, locale });
      },
    );

    it('leaves locale untouched when it is omitted', async () => {
      userModelMock.findByIdAndUpdate.mockResolvedValue(
        new UserModel({
          _id: userId,
          googleId: 'g',
          email: 'jane@example.com',
        }),
      );

      await service.updateMe(jwtPayload, {});

      expect(userModelMock.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        { $set: {} },
        expect.anything(),
      );
    });

    it('rejects when the user no longer exists', async () => {
      userModelMock.findByIdAndUpdate.mockResolvedValue(null);

      await expect(
        service.updateMe(jwtPayload, { locale: 'es' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token subject that is not an ObjectId', async () => {
      await expect(
        service.updateMe({ ...jwtPayload, sub: 'nope' }, { locale: 'es' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(userModelMock.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });
});
