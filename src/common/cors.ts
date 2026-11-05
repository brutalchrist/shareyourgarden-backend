// What `*` may stand for inside an origin: letters, digits and hyphens only,
// never a dot, so a wildcard stays within one DNS label and cannot reach
// another domain (`https://*.example.com` does not allow `https://evil.com`).
const WILDCARD = '[a-z0-9-]+';

/**
 * Parses `CORS_ORIGINS`, a comma-separated list of allowed origins, into what
 * `enableCors` takes. An entry with `*` becomes a pattern, e.g.
 * `https://deploy-preview-*--shareyourgarden.netlify.app` for every Netlify
 * deploy preview; any other entry must match exactly.
 */
export function parseCorsOrigins(value: string): (string | RegExp)[] {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map((origin) => {
      if (!origin.includes('*')) {
        return origin;
      }
      const pattern = origin
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
        .join(WILDCARD);
      return new RegExp(`^${pattern}$`, 'i');
    });
}
