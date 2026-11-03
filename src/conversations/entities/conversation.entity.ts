import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Garden } from '../../gardens/entities/garden.entity';
import { User } from '../../users/entities/user.entity';

export const CONVERSATION_ROLES = ['owner', 'requester'] as const;
export type ConversationRole = (typeof CONVERSATION_ROLES)[number];

// Snapshot of a participant, so the inbox renders without joining users.
@Schema({ _id: false })
export class Participant {
  @Prop({ required: true })
  name: string;

  @Prop()
  picture?: string;
}

const ParticipantSchema = SchemaFactory.createForClass(Participant);

@Schema({ _id: false })
export class LastMessage {
  @Prop({ required: true })
  body: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  senderId: Types.ObjectId;

  @Prop({ required: true })
  createdAt: Date;
}

const LastMessageSchema = SchemaFactory.createForClass(LastMessage);

/**
 * A thread between a garden's owner and someone interested in it. There is at
 * most one per (garden, requester): writing to the same garden again reuses
 * it, while another garden of the same owner gets its own thread.
 */
@Schema({ timestamps: true })
export class Conversation extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Garden.name,
    required: true,
  })
  gardenId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  ownerId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  requesterId: Types.ObjectId;

  // Garden name when the conversation started, kept if the garden goes away.
  @Prop({ required: true })
  gardenName: string;

  @Prop({ type: ParticipantSchema, required: true })
  owner: Participant;

  @Prop({ type: ParticipantSchema, required: true })
  requester: Participant;

  // Product the requester is interested in, if they picked one.
  @Prop({ maxlength: 60 })
  productName?: string;

  @Prop({ type: LastMessageSchema })
  lastMessage?: LastMessage;

  // Messages each side has not read yet.
  @Prop({ default: 0, min: 0 })
  ownerUnread: number;

  @Prop({ default: 0, min: 0 })
  requesterUnread: number;

  @Prop()
  ownerLastReadAt?: Date;

  @Prop()
  requesterLastReadAt?: Date;

  // Set when the garden is deleted: the conversation stays, read-only.
  @Prop({ default: false })
  gardenDeleted: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ gardenId: 1, requesterId: 1 }, { unique: true });
ConversationSchema.index({ ownerId: 1, 'lastMessage.createdAt': -1 });
ConversationSchema.index({ requesterId: 1, 'lastMessage.createdAt': -1 });
// Counting a requester's new conversations for the rate limit.
ConversationSchema.index({ requesterId: 1, createdAt: -1 });
