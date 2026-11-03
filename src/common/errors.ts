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
  // The garden predates owner ids, so there is nobody to write to.
  GARDEN_HAS_NO_OWNER: 'GARDEN_HAS_NO_OWNER',
  CANNOT_CONTACT_OWN_GARDEN: 'CANNOT_CONTACT_OWN_GARDEN',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  // A message id used as a pagination cursor is not in the conversation.
  INVALID_MESSAGE_CURSOR: 'INVALID_MESSAGE_CURSOR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
