import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthFlowService } from './auth-flow.service';

describe('AuthFlowService', () => {
  let service: AuthFlowService;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'session-secret';
    process.env.FRONTEND_RETURN_TO_ALLOWLIST =
      'https://shareyourgarden.com,https://deploy-preview-*.--shareyourgarden.netlify.app';
    service = new AuthFlowService();
  });

  it('creates and verifies signed oauth state', () => {
    const { state, nonce } = service.createOAuthState(
      'https://deploy-preview-123.--shareyourgarden.netlify.app/dashboard',
    );

    const payload = service.verifyOAuthState(state);
    expect(payload.returnTo).toContain('deploy-preview-123');
    expect(payload.nonce).toBe(nonce);
  });

  it('validates preview return_to using wildcard allowlist', () => {
    expect(() =>
      service.validateReturnTo(
        'https://deploy-preview-321.--shareyourgarden.netlify.app',
      ),
    ).not.toThrow();
  });

  it('rejects non-allowlisted return_to', () => {
    expect(() => service.validateReturnTo('https://evil.example.com')).toThrow(
      ForbiddenException,
    );
  });

  it('fails on tampered state signature', () => {
    const { state } = service.createOAuthState('https://shareyourgarden.com');
    const tampered = `${state}x`;
    expect(() => service.verifyOAuthState(tampered)).toThrow(
      UnauthorizedException,
    );
  });
});
