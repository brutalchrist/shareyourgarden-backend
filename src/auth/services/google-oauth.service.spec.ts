import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createSign, generateKeyPairSync } from 'crypto';
import { GoogleOAuthService } from './google-oauth.service';

describe('GoogleOAuthService', () => {
  let service: GoogleOAuthService;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    process.env.GOOGLE_ALLOWED_REDIRECT_URIS = 'https://shareyourgarden.app';
    service = new GoogleOAuthService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('validates redirect URI against whitelist', () => {
    expect(() =>
      service.validateRedirectUri('https://shareyourgarden.app'),
    ).not.toThrow();
    expect(() => service.validateRedirectUri('https://evil.app')).toThrow(
      ForbiddenException,
    );
  });

  it('exchanges authorization code for id token', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id_token: 'google-id-token' }),
    } as Response);

    await expect(
      service.exchangeCodeForIdToken('code-123', 'https://shareyourgarden.app'),
    ).resolves.toBe('google-id-token');
  });

  it('throws unauthorized when google code exchange fails', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);

    await expect(
      service.exchangeCodeForIdToken('invalid', 'https://shareyourgarden.app'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('verifies a valid id token', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    const header = { alg: 'RS256', typ: 'JWT', kid: 'kid-1' };
    const payload = {
      iss: 'https://accounts.google.com',
      aud: 'google-client-id',
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'google-sub',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://image.test',
      email_verified: true,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      'base64url',
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signer = createSign('RSA-SHA256');
    signer.update(`${encodedHeader}.${encodedPayload}`);
    signer.end();
    const signature = signer.sign(privateKey).toString('base64url');
    const token = `${encodedHeader}.${encodedPayload}.${signature}`;

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          kid1: publicKey.export({ type: 'spki', format: 'pem' }),
        }),
    } as Response);

    await expect(service.verifyIdToken(token)).rejects.toThrow(
      UnauthorizedException,
    );

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          'kid-1': publicKey.export({ type: 'spki', format: 'pem' }),
        }),
    } as Response);

    await expect(service.verifyIdToken(token)).resolves.toMatchObject({
      sub: 'google-sub',
      email: 'test@example.com',
    });
  });
});
