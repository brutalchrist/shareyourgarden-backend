import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/entities/user.entity';
import { Conversation } from './conversation.entity';

export const MESSAGE_MAX_LENGTH = 2000;

@Schema({ _id: false })
export class SharedLocation {
  @Prop({ required: true, enum: ['Point'], default: 'Point' })
  type: 'Point';

  @Prop({ type: [Number], required: true })
  coordinates: number[];
}

const SharedLocationSchema = SchemaFactory.createForClass(SharedLocation);

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Message extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Conversation.name,
    required: true,
  })
  conversationId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  senderId: Types.ObjectId;

  @Prop({ required: true, maxlength: MESSAGE_MAX_LENGTH })
  body: string;

  // The garden's exact point, when its owner chose to share it in this
  // message. A copy: it does not follow the garden if it moves later.
  @Prop({ type: SharedLocationSchema })
  sharedLocation?: SharedLocation;

  createdAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
// Counting a sender's recent messages for the rate limit.
MessageSchema.index({ senderId: 1, createdAt: -1 });
