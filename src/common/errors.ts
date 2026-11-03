// Stable codes sent in the `code` field of error responses so clients can
// show their own translated messages. Codes not listed here are derived from
// the HTTP status by HttpExceptionFilter (e.g. 404 -> NOT_FOUND).
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_GOOGLE_CREDENTIAL: 'INVALID_GOOGLE_CREDENTIAL',
  GOOGLE_EMAIL_NOT_VERIFIED: 'GOOGLE_EMAIL_NOT_VERIFIED',
  INVALID_POLYGON: 'INVALID_POLYGON',
  GARDEN_NOT_FOUND: 'GARDEN_NOT_FOUND',
  GARDEN_NOT_OWNED: 'GARDEN_NOT_OWNED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
