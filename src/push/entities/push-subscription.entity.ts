import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/entities/user.entity';
import { LOCALES, type Locale } from '../../users/users.constants';

@Schema({ _id: false })
export class PushKeys {
  @Prop({ required: true })
  p256dh: string;

  @Prop({ required: true })
  auth: string;
}

const PushKeysSchema = SchemaFactory.createForClass(PushKeys);

/**
 * A browser's Web Push subscription. The endpoint identifies the browser
 * install, so it belongs to whoever subscribed from it last.
 */
@Schema({ timestamps: true })
export class PushSubscription extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  endpoint: string;

  @Prop({ type: PushKeysSchema, required: true })
  keys: PushKeys;

  // Language the notification is shown in on that device.
  @Prop({ type: String, enum: LOCALES, required: true })
  locale: Locale;

  createdAt: Date;
  updatedAt: Date;
}

export const PushSubscriptionSchema =
  SchemaFactory.createForClass(PushSubscription);
PushSubscriptionSchema.index({ user: 1 });
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
