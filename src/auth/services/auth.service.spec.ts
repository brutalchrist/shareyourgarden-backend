import { InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { UsersService } from './users.service';

describe('AuthService', () => {
  let service: AuthService;

  const googleOAuthServiceMock = {
    validateRedirectUri: jest.fn(),
    exchangeCodeForIdToken: jest.fn(),
    verifyIdToken: jest.fn(),
  };

  const usersServiceMock = {
    findOrCreateFromGoogle: jest.fn(),
  };

  beforeEach(async () => {
    process.env.JWT_SECRET = 'jwt-secret';
    process.env.JWT_EXPIRES_IN = '1h';

    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: GoogleOAuthService, useValue: googleOAuthServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('returns user and app token on successful login', async () => {
    googleOAuthServiceMock.exchangeCodeForIdToken.mockResolvedValue('id-token');
    googleOAuthServiceMock.verifyIdToken.mockResolvedValue({
      sub: 'sub-1',
      email: 'test@mail.com',
      name: 'Test',
      picture: 'pic',
    });
    usersServiceMock.findOrCreateFromGoogle.mockResolvedValue({
      id: 'user-1',
      email: 'test@mail.com',
      name: 'Test',
      picture: 'pic',
      roles: ['user'],
    });

    const result = await service.loginWithGoogle({
      code: 'code',
      redirectUri: 'https://shareyourgarden.app',
    });

    expect(result.user.email).toBe('test@mail.com');
    expect(result.token.split('.')).toHaveLength(3);
  });

  it('fails if JWT secret is missing', async () => {
    delete process.env.JWT_SECRET;
    googleOAuthServiceMock.exchangeCodeForIdToken.mockResolvedValue('id-token');
    googleOAuthServiceMock.verifyIdToken.mockResolvedValue({
      sub: 'sub-1',
      email: 'test@mail.com',
      name: 'Test',
      picture: 'pic',
    });
    usersServiceMock.findOrCreateFromGoogle.mockResolvedValue({
      id: 'user-1',
      email: 'test@mail.com',
      name: 'Test',
      picture: 'pic',
      roles: ['user'],
    });

    await expect(
      service.loginWithGoogle({
        code: 'code',
        redirectUri: 'https://shareyourgarden.app',
      }),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
