// Languages a user can pick. Adding one here is enough for the backend.
export const LOCALES = ['es', 'en'] as const;

export type Locale = (typeof LOCALES)[number];
