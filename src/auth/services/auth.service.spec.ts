import { UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { UsersService } from '../../users/services/users.service';
import { AuthService } from './auth.service';

const GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const JWT_SECRET = 'test-secret';

const googlePayload: TokenPayload = {
  iss: 'https://accounts.google.com',
  sub: 'google-123',
  aud: GOOGLE_CLIENT_ID,
  iat: 0,
  exp: 0,
  email: 'jane@example.com',
  email_verified: true,
  name: 'Jane Doe',
  picture: 'https://example.com/jane.png',
};

const userDto = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  email: 'jane@example.com',
  name: 'Jane Doe',
  picture: 'https://example.com/jane.png',
};

const googleClientMock = {
  verifyIdToken: jest.fn(),
};

const usersServiceMock = {
  upsertFromGoogle: jest.fn().mockResolvedValue(userDto),
  findById: jest.fn(),
};

const mockTicket = (payload: Partial<TokenPayload>) =>
  googleClientMock.verifyIdToken.mockResolvedValue({
    getPayload: () => ({ ...googlePayload, ...payload }),
  });

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [() => ({ GOOGLE_CLIENT_ID, JWT_SECRET })],
        }),
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { algorithm: 'HS256', expiresIn: '7d' },
        }),
      ],
      providers: [
        AuthService,
        { provide: OAuth2Client, useValue: googleClientMock },
        { provide: UsersService, useValue: usersServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('loginWithGoogle', () => {
    it('returns a signed JWT and the user for a valid credential', async () => {
      mockTicket({});

      const result = await service.loginWithGoogle('valid-token');

      expect(googleClientMock.verifyIdToken).toHaveBeenCalledWith({
        idToken: 'valid-token',
        audience: GOOGLE_CLIENT_ID,
      });
      expect(usersServiceMock.upsertFromGoogle).toHaveBeenCalledWith(
        googlePayload,
      );
      expect(result.user).toEqual(userDto);

      const decoded = jwtService.verify<{ sub: string; email: string }>(
        result.accessToken,
      );
      expect(decoded).toMatchObject({ sub: userDto.id, email: userDto.email });
    });

    it('rejects a credential that Google fails to verify', async () => {
      googleClientMock.verifyIdToken.mockRejectedValue(
        new Error('Wrong recipient, payload audience != requiredAudience'),
      );

      await expect(service.loginWithGoogle('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersServiceMock.upsertFromGoogle).not.toHaveBeenCalled();
    });

    it('rejects a credential issued for another audience', async () => {
      mockTicket({ aud: 'another-client-id' });

      await expect(service.loginWithGoogle('other-aud')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersServiceMock.upsertFromGoogle).not.toHaveBeenCalled();
    });

    it('rejects a credential with an unverified email', async () => {
      mockTicket({ email_verified: false });

      await expect(service.loginWithGoogle('unverified')).rejects.toThrow(
        'Google email is not verified',
      );
      expect(usersServiceMock.upsertFromGoogle).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('returns the user for the token subject', async () => {
      usersServiceMock.findById.mockResolvedValue(userDto);

      await expect(
        service.getCurrentUser({ sub: userDto.id, email: userDto.email }),
      ).resolves.toEqual(userDto);
    });

    it('rejects when the user no longer exists', async () => {
      usersServiceMock.findById.mockResolvedValue(null);

      await expect(
        service.getCurrentUser({ sub: userDto.id, email: userDto.email }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
