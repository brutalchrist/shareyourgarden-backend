import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import type { ConversationRole } from '../entities/conversation.entity';
import { MESSAGE_MAX_LENGTH } from '../entities/message.entity';

// Like @IsOptional, but only for omitted fields: an explicit null still fails validation.
const IsOmittable = () => ValidateIf((_, value) => value !== undefined);

const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export const CONVERSATION_FILTERS = ['all', 'received', 'sent'] as const;
export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

export class ParticipantDto {
  id: string;
  name: string;
  picture?: string;
}

export class LastMessageDto {
  body: string;
  senderId: string;
  createdAt: Date;
}

export class ConversationDto {
  id: string;
  gardenId: string;
  gardenName: string;
  productName?: string;
  // The authenticated user's side of the conversation.
  role: ConversationRole;
  otherUser: ParticipantDto;
  lastMessage: LastMessageDto | null;
  // Messages the authenticated user has not read yet.
  unreadCount: number;
  // When the other side last read the thread, to show "Seen".
  otherLastReadAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ConversationsPageDto {
  conversations: ConversationDto[];
  hasMore: boolean;
}

export class MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: Date;
}

export class MessagesPageDto {
  // Oldest first.
  messages: MessageDto[];
  hasMore: boolean;
}

export class ConversationsSummaryDto {
  // Conversations with unread messages, in either role.
  unread: number;
  // Conversations with unread messages per garden the user owns.
  byGarden: Record<string, number>;
}

export class StartConversationDto {
  @IsMongoId()
  gardenId: string;

  @IsOmittable()
  @Trim()
  @IsString()
  @Length(1, 60)
  productName?: string;

  @Trim()
  @IsString()
  @Length(1, MESSAGE_MAX_LENGTH)
  body: string;
}

export class SendMessageDto {
  @Trim()
  @IsString()
  @Length(1, MESSAGE_MAX_LENGTH)
  body: string;
}

export class ListConversationsQueryDto {
  @IsOmittable()
  @IsIn(CONVERSATION_FILTERS)
  role?: ConversationFilter;

  @IsOmittable()
  @IsMongoId()
  gardenId?: string;

  // `lastMessage.createdAt` of the last conversation of the previous page.
  @IsOmittable()
  @IsISO8601({ strict: true })
  before?: string;

  @IsOmittable()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ListMessagesQueryDto {
  // Id of the oldest message the client has, to load older history.
  @IsOmittable()
  @IsMongoId()
  before?: string;

  // Id of the newest message the client has, to poll for new ones.
  @IsOmittable()
  @IsMongoId()
  after?: string;

  @IsOmittable()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
