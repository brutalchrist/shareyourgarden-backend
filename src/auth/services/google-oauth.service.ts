import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createPublicKey, verify } from 'crypto';

interface GoogleTokenResponse {
  id_token?: string;
}

interface GoogleIdTokenPayload {
  iss?: string;
  aud?: string;
  exp?: number;
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

interface GoogleCertsResponse {
  [kid: string]: string;
}

@Injectable()
export class GoogleOAuthService {
  private getAllowedRedirectUris(): string[] {
    return (process.env.GOOGLE_ALLOWED_REDIRECT_URIS ?? '')
      .split(',')
      .map((uri) => uri.trim())
      .filter(Boolean);
  }

  validateRedirectUri(redirectUri: string): void {
    const allowedUris = this.getAllowedRedirectUris();
    if (allowedUris.length > 0 && !allowedUris.includes(redirectUri)) {
      throw new ForbiddenException('redirectUri is not allowed');
    }
  }

  async exchangeCodeForIdToken(
    code: string,
    redirectUri: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!response.ok) {
      throw new UnauthorizedException('Invalid authorization code');
    }

    const payload = (await response.json()) as GoogleTokenResponse;
    if (!payload.id_token) {
      throw new UnauthorizedException('Google response missing id_token');
    }

    return payload.id_token;
  }

  async verifyIdToken(
    idToken: string,
  ): Promise<Required<GoogleIdTokenPayload>> {
    const [encodedHeader, encodedPayload, encodedSignature] =
      idToken.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new UnauthorizedException('Malformed id_token');
    }

    const header = JSON.parse(this.base64UrlDecode(encodedHeader)) as {
      alg?: string;
      kid?: string;
    };
    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException('Unsupported id_token header');
    }

    const payload = JSON.parse(
      this.base64UrlDecode(encodedPayload),
    ) as GoogleIdTokenPayload;

    const certsResponse = await fetch(
      'https://www.googleapis.com/oauth2/v1/certs',
    );
    if (!certsResponse.ok) {
      throw new UnauthorizedException('Could not fetch Google certificates');
    }

    const certs = (await certsResponse.json()) as GoogleCertsResponse;
    const certPem = certs[header.kid];
    if (!certPem) {
      throw new UnauthorizedException('Unknown Google key id');
    }

    const verifier = verify(
      'RSA-SHA256',
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      createPublicKey(certPem),
      this.base64UrlToBuffer(encodedSignature),
    );

    if (!verifier) {
      throw new UnauthorizedException('Invalid Google token signature');
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const validIssuer =
      payload.iss === 'accounts.google.com' ||
      payload.iss === 'https://accounts.google.com';

    if (!validIssuer) {
      throw new UnauthorizedException('Invalid token issuer');
    }

    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      throw new UnauthorizedException('Invalid token audience');
    }

    if (!payload.exp || payload.exp <= nowInSeconds) {
      throw new UnauthorizedException('Expired Google token');
    }

    if (
      !payload.sub ||
      !payload.email ||
      !payload.name ||
      payload.email_verified !== true
    ) {
      throw new UnauthorizedException('Invalid Google user claims');
    }

    return payload as Required<GoogleIdTokenPayload>;
  }

  private base64UrlDecode(value: string): string {
    return this.base64UrlToBuffer(value).toString('utf8');
  }

  private base64UrlToBuffer(value: string): Buffer {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64');
  }
}
