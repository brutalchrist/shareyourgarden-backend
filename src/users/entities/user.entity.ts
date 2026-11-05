import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { LOCALES, type Locale } from '../users.constants';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, index: true })
  googleId: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  name: string;

  @Prop()
  picture: string;

  // null (or missing on older documents) means "follow the browser/system".
  @Prop({ type: String, enum: [...LOCALES, null], default: null })
  locale: Locale | null;

  // When the user finished or skipped the welcome tour; null (or missing on
  // older documents) means they have not seen it yet.
  @Prop({ type: Date, default: null })
  onboardingCompletedAt: Date | null;

  // People this user blocked: neither side can message the other.
  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  blockedUserIds: Types.ObjectId[];
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ blockedUserIds: 1 });
