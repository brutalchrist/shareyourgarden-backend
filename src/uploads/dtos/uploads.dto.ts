import { IsIn, IsInt, Max, Min } from 'class-validator';
import {
  IMAGE_CONTENT_TYPES,
  IMAGE_FULL_MAX_BYTES,
  IMAGE_MAX_DIMENSION,
  IMAGE_THUMB_MAX_BYTES,
  type ImageContentType,
} from '../uploads.constants';

export class CreateImageUploadDto {
  @IsIn(IMAGE_CONTENT_TYPES)
  contentType: ImageContentType;

  // Exact byte sizes of the two files; the signed URLs only accept these.
  @IsInt()
  @Min(1)
  @Max(IMAGE_FULL_MAX_BYTES)
  fullSize: number;

  @IsInt()
  @Min(1)
  @Max(IMAGE_THUMB_MAX_BYTES)
  thumbSize: number;

  // Of the full-size image, so pages can reserve its space before it loads.
  @IsInt()
  @Min(1)
  @Max(IMAGE_MAX_DIMENSION)
  width: number;

  @IsInt()
  @Min(1)
  @Max(IMAGE_MAX_DIMENSION)
  height: number;
}

export class SignedUploadDto {
  url: string;
  // Headers the PUT must send exactly, since they are signed.
  headers: Record<string, string>;
}

export class ImageUploadDto {
  id: string;
  full: SignedUploadDto;
  thumb: SignedUploadDto;
  // Public URL of the uploaded thumbnail, valid until the upload expires, so
  // unsaved drafts can show it after a reload.
  previewUrl: string;
}
