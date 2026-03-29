import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '../schemas/user.schema';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const userModelMock = {
    findOne: jest.fn(),
    create: jest.fn(),
  };

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

  it('creates a user when none exists', async () => {
    userModelMock.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    userModelMock.create.mockResolvedValue({
      _id: { toString: () => '1' },
      email: 'mail@test.com',
      name: 'Name',
      roles: ['user'],
    });

    const result = await service.findOrCreateFromGoogle({
      sub: 'sub-1',
      email: 'mail@test.com',
      name: 'Name',
      picture: 'pic',
    });

    expect(userModelMock.create).toHaveBeenCalled();
    expect(result.id).toBe('1');
  });

  it('updates existing user by googleSub', async () => {
    const save = jest.fn().mockResolvedValue({
      _id: { toString: () => '2' },
      email: 'new@test.com',
      name: 'New Name',
      picture: 'new-pic',
      roles: ['user'],
    });
    userModelMock.findOne.mockResolvedValueOnce({
      googleSub: 'sub-1',
      email: 'old@test.com',
      name: 'Old',
      save,
    });

    await service.findOrCreateFromGoogle({
      sub: 'sub-1',
      email: 'new@test.com',
      name: 'New Name',
      picture: 'new-pic',
    });

    expect(save).toHaveBeenCalled();
    expect(userModelMock.create).not.toHaveBeenCalled();
  });

  it('links existing user by email with google sub', async () => {
    const save = jest.fn().mockResolvedValue({
      _id: { toString: () => '3' },
      email: 'mail@test.com',
      name: 'Name',
      picture: 'pic',
      roles: ['user'],
    });
    userModelMock.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      email: 'mail@test.com',
      save,
    });

    await service.findOrCreateFromGoogle({
      sub: 'sub-3',
      email: 'mail@test.com',
      name: 'Name',
      picture: 'pic',
    });

    expect(save).toHaveBeenCalled();
  });
});
