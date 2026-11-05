// Photos are resized and re-encoded in the browser before upload, so these
// limits are generous for a 1600 px WebP/JPEG and a 320 px thumbnail.
export const IMAGE_CONTENT_TYPES = ['image/webp', 'image/jpeg'] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

export const IMAGE_FULL_MAX_BYTES = 1_500_000;
export const IMAGE_THUMB_MAX_BYTES = 200_000;
export const IMAGE_MAX_DIMENSION = 4096;

export const MAX_IMAGES_PER_PRODUCT = 3;
// Anti-abuse limit on signed upload URLs per user.
export const MAX_UPLOADS_PER_HOUR = 30;
// Unclaimed uploads expire after a day. The bucket needs a lifecycle rule on
// the `tmp/` prefix with the same age so their files go away too.
export const UPLOAD_TTL_SECONDS = 24 * 60 * 60;

export const IMAGE_VARIANTS = ['full', 'thumb'] as const;
export type ImageVariant = (typeof IMAGE_VARIANTS)[number];

/** Where the browser uploads a photo before its garden is saved. */
export const tmpImageKey = (imageId: string, variant: ImageVariant) =>
  `tmp/${imageId}/${variant}`;

/** Where a photo lives once its garden is saved. */
export const gardenImagePrefix = (gardenId: string) => `gardens/${gardenId}/`;

export const gardenImageKey = (
  gardenId: string,
  imageId: string,
  variant: ImageVariant,
) => `${gardenImagePrefix(gardenId)}${imageId}/${variant}`;
