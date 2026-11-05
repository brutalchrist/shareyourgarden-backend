import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/entities/user.entity';
import {
  IMAGE_CONTENT_TYPES,
  UPLOAD_TTL_SECONDS,
  type ImageContentType,
} from '../uploads.constants';

/**
 * A photo the browser was allowed to upload to `tmp/`. Saving a garden that
 * references it copies the files to the garden and sets `gardenId`, so the
 * same upload can't be claimed twice. Records expire after a day either way;
 * they also count toward the hourly upload limit.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Upload extends Document {
  @Prop({ required: true, unique: true })
  imageId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: IMAGE_CONTENT_TYPES })
  contentType: ImageContentType;

  @Prop({ required: true, min: 1 })
  width: number;

  @Prop({ required: true, min: 1 })
  height: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  gardenId: Types.ObjectId | null;

  createdAt: Date;
}

export const UploadSchema = SchemaFactory.createForClass(Upload);
UploadSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: UPLOAD_TTL_SECONDS },
);
// Counting a user's recent uploads for the rate limit.
UploadSchema.index({ userId: 1, createdAt: -1 });
