import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/entities/user.entity';
import { Conversation } from './conversation.entity';

export const MESSAGE_MAX_LENGTH = 2000;

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

  createdAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
// Counting a sender's recent messages for the rate limit.
MessageSchema.index({ senderId: 1, createdAt: -1 });
