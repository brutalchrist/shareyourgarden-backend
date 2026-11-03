// Anti-spam limits. A conversation is new when the requester had never
// written about that garden; writing again to an existing one only counts as
// messages.
export const MAX_NEW_CONVERSATIONS_PER_HOUR = 10;
export const MAX_MESSAGES_PER_MINUTE = 20;
