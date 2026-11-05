import { parseCorsOrigins } from './cors';

function allows(origins: (string | RegExp)[], origin: string): boolean {
  return origins.some((allowed) =>
    typeof allowed === 'string' ? allowed === origin : allowed.test(origin),
  );
}

describe('parseCorsOrigins', () => {
  it('keeps exact origins as strings', () => {
    expect(
      parseCorsOrigins(
        ' http://localhost:3000 , https://shareyourgarden.netlify.app/ ,',
      ),
    ).toEqual(['http://localhost:3000', 'https://shareyourgarden.netlify.app']);
  });

  it('allows every Netlify deploy preview with a wildcard', () => {
    const origins = parseCorsOrigins(
      'https://deploy-preview-*--shareyourgarden.netlify.app',
    );

    expect(
      allows(origins, 'https://deploy-preview-34--shareyourgarden.netlify.app'),
    ).toBe(true);
    expect(
      allows(origins, 'https://deploy-preview-1--shareyourgarden.netlify.app'),
    ).toBe(true);
  });

  it('keeps a wildcard within one DNS label', () => {
    const origins = parseCorsOrigins(
      'https://deploy-preview-*--shareyourgarden.netlify.app,https://*.example.com',
    );

    expect(
      allows(
        origins,
        'https://deploy-preview-1.evil.com--shareyourgarden.netlify.app',
      ),
    ).toBe(false);
    expect(
      allows(
        origins,
        'https://deploy-preview-1--shareyourgarden.netlify.app.evil.com',
      ),
    ).toBe(false);
    expect(
      allows(origins, 'http://deploy-preview-1--shareyourgarden.netlify.app'),
    ).toBe(false);
    expect(allows(origins, 'https://a.b.example.com')).toBe(false);
    expect(allows(origins, 'https://example.com')).toBe(false);
    expect(allows(origins, 'https://app.example.com')).toBe(true);
  });

  it('treats the other characters of a pattern literally', () => {
    const origins = parseCorsOrigins('https://*.example.com');

    expect(allows(origins, 'https://appXexample.com')).toBe(false);
  });
});
