import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, QueryFilter, Types } from 'mongoose';
import { JwtPayload } from '../../auth/dtos/auth.dto';
import { ErrorCode } from '../../common/errors';
import { Garden } from '../../gardens/entities/garden.entity';
import { UsersService } from '../../users/services/users.service';
import {
  ConversationDto,
  ConversationsPageDto,
  ConversationsSummaryDto,
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  MessageDto,
  MessagesPageDto,
  SendMessageDto,
  StartConversationDto,
} from '../dtos/conversations.dto';
import {
  Conversation,
  type ConversationRole,
} from '../entities/conversation.entity';
import { Message } from '../entities/message.entity';

const DEFAULT_CONVERSATIONS_LIMIT = 20;
const DEFAULT_MESSAGES_LIMIT = 30;

const otherRole = (role: ConversationRole): ConversationRole =>
  role === 'owner' ? 'requester' : 'owner';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<Conversation>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(Garden.name) private gardenModel: Model<Garden>,
    private readonly usersService: UsersService,
  ) {}

  mapConversationToDto(
    conversation: Conversation,
    userId: string,
  ): ConversationDto {
    const role = this.roleOf(conversation, userId);
    const other = otherRole(role);
    const { lastMessage } = conversation;

    return {
      id: String(conversation._id),
      gardenId: String(conversation.gardenId),
      gardenName: conversation.gardenName,
      productName: conversation.productName,
      role,
      otherUser: {
        id: String(conversation[`${other}Id`]),
        name: conversation[other].name,
        picture: conversation[other].picture,
      },
      lastMessage: lastMessage
        ? {
            body: lastMessage.body,
            senderId: String(lastMessage.senderId),
            createdAt: lastMessage.createdAt,
          }
        : null,
      unreadCount: conversation[`${role}Unread`] ?? 0,
      otherLastReadAt: conversation[`${other}LastReadAt`] ?? null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  mapMessageToDto(message: Message): MessageDto {
    return {
      id: String(message._id),
      conversationId: String(message.conversationId),
      senderId: String(message.senderId),
      body: message.body,
      createdAt: message.createdAt,
    };
  }

  /**
   * Writes to a garden's owner: reuses the requester's conversation about
   * that garden, or starts one, and appends the message.
   */
  async start(
    user: JwtPayload,
    body: StartConversationDto,
  ): Promise<ConversationDto> {
    const requesterId = this.userObjectId(user);
    const garden = isValidObjectId(body.gardenId)
      ? await this.gardenModel.findById(body.gardenId)
      : null;

    // Hidden gardens are only visible to their owner.
    if (!garden || garden.active === false) {
      throw new NotFoundException({
        message: 'Garden not found',
        code: ErrorCode.GARDEN_NOT_FOUND,
      });
    }

    if (!garden.ownerId) {
      throw new ConflictException({
        message: 'This garden has no owner to contact',
        code: ErrorCode.GARDEN_HAS_NO_OWNER,
      });
    }

    if (garden.ownerId.equals(requesterId)) {
      throw new BadRequestException({
        message: 'You cannot start a conversation about your own garden',
        code: ErrorCode.CANNOT_CONTACT_OWN_GARDEN,
      });
    }

    const [requester, owner] = await Promise.all([
      this.usersService.findById(user.sub),
      this.usersService.findById(String(garden.ownerId)),
    ]);

    if (!requester) {
      throw new UnauthorizedException();
    }

    // Two concurrent first messages cannot create two conversations: the
    // filter matches the unique index exactly, so MongoDB retries the losing
    // upsert as an update.
    const conversation = await this.conversationModel.findOneAndUpdate(
      { gardenId: garden._id, requesterId },
      {
        $setOnInsert: {
          ownerId: garden.ownerId,
          gardenName: garden.name,
          owner: {
            name: owner?.name || garden.owner?.name || owner?.email,
            picture: owner?.picture,
          },
          requester: {
            name: requester.name || requester.email,
            picture: requester.picture,
          },
        },
        // The latest product of interest wins.
        ...(body.productName
          ? { $set: { productName: body.productName } }
          : {}),
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    const updated = await this.appendMessage(
      conversation,
      'requester',
      requesterId,
      body.body,
    );

    return this.mapConversationToDto(updated.conversation, user.sub);
  }

  async list(
    user: JwtPayload,
    query: ListConversationsQueryDto,
  ): Promise<ConversationsPageDto> {
    const userId = this.userObjectId(user);
    const limit = query.limit ?? DEFAULT_CONVERSATIONS_LIMIT;
    const role = query.role ?? 'all';

    const filter: QueryFilter<Conversation> = {
      // A conversation whose first message failed to save is not listed.
      'lastMessage.createdAt': query.before
        ? { $lt: new Date(query.before) }
        : { $exists: true },
    };
    if (role === 'received') {
      filter.ownerId = userId;
    } else if (role === 'sent') {
      filter.requesterId = userId;
    } else {
      filter.$or = [{ ownerId: userId }, { requesterId: userId }];
    }
    if (query.gardenId) {
      filter.gardenId = new Types.ObjectId(query.gardenId);
    }

    const conversations = await this.conversationModel
      .find(filter)
      .sort({ 'lastMessage.createdAt': -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    return {
      conversations: conversations
        .slice(0, limit)
        .map((conversation) =>
          this.mapConversationToDto(conversation, user.sub),
        ),
      hasMore: conversations.length > limit,
    };
  }

  async summary(user: JwtPayload): Promise<ConversationsSummaryDto> {
    const userId = this.userObjectId(user);
    const [asOwner, asRequester] = await Promise.all([
      this.conversationModel
        .find({ ownerId: userId, ownerUnread: { $gt: 0 } }, { gardenId: 1 })
        .exec(),
      this.conversationModel
        .countDocuments({ requesterId: userId, requesterUnread: { $gt: 0 } })
        .exec(),
    ]);

    const byGarden: Record<string, number> = {};
    for (const { gardenId } of asOwner) {
      const id = String(gardenId);
      byGarden[id] = (byGarden[id] ?? 0) + 1;
    }

    return { unread: asOwner.length + asRequester, byGarden };
  }

  async findById(user: JwtPayload, id: string): Promise<ConversationDto> {
    const conversation = await this.findParticipatingOrFail(user, id);

    return this.mapConversationToDto(conversation, user.sub);
  }

  async listMessages(
    user: JwtPayload,
    id: string,
    query: ListMessagesQueryDto,
  ): Promise<MessagesPageDto> {
    const conversation = await this.findParticipatingOrFail(user, id);
    const limit = query.limit ?? DEFAULT_MESSAGES_LIMIT;
    const filter: QueryFilter<Message> = { conversationId: conversation._id };

    if (query.after) {
      // Polling for new messages: oldest first from the cursor on.
      const cursor = await this.findCursorOrFail(conversation, query.after);
      filter.$or = [
        { createdAt: { $gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $gt: cursor._id } },
      ];
      const messages = await this.messageModel
        .find(filter)
        .sort({ createdAt: 1, _id: 1 })
        .limit(limit + 1)
        .exec();

      return {
        messages: messages
          .slice(0, limit)
          .map((message) => this.mapMessageToDto(message)),
        hasMore: messages.length > limit,
      };
    }

    // Latest page, or older history before the cursor.
    if (query.before) {
      const cursor = await this.findCursorOrFail(conversation, query.before);
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
      ];
    }
    const messages = await this.messageModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    return {
      messages: messages
        .slice(0, limit)
        .reverse()
        .map((message) => this.mapMessageToDto(message)),
      hasMore: messages.length > limit,
    };
  }

  async sendMessage(
    user: JwtPayload,
    id: string,
    body: SendMessageDto,
  ): Promise<MessageDto> {
    const conversation = await this.findParticipatingOrFail(user, id);
    const { message } = await this.appendMessage(
      conversation,
      this.roleOf(conversation, user.sub),
      this.userObjectId(user),
      body.body,
    );

    return this.mapMessageToDto(message);
  }

  async markRead(user: JwtPayload, id: string): Promise<void> {
    const conversation = await this.findParticipatingOrFail(user, id);
    const role = this.roleOf(conversation, user.sub);

    await this.conversationModel.updateOne(
      { _id: conversation._id },
      { $set: { [`${role}Unread`]: 0, [`${role}LastReadAt`]: new Date() } },
    );
  }

  private async appendMessage(
    conversation: Conversation,
    role: ConversationRole,
    senderId: Types.ObjectId,
    body: string,
  ): Promise<{ conversation: Conversation; message: Message }> {
    const message = await this.messageModel.create({
      conversationId: conversation._id,
      senderId,
      body,
    });

    // Writing implies having read the thread up to here.
    const updated = await this.conversationModel.findByIdAndUpdate(
      conversation._id,
      {
        $set: {
          lastMessage: { body, senderId, createdAt: message.createdAt },
          [`${role}Unread`]: 0,
          [`${role}LastReadAt`]: message.createdAt,
        },
        $inc: { [`${otherRole(role)}Unread`]: 1 },
      },
      { returnDocument: 'after' },
    );

    return { conversation: updated ?? conversation, message };
  }

  // Someone else's conversation is reported as missing, not forbidden, so
  // its existence does not leak.
  private async findParticipatingOrFail(
    user: JwtPayload,
    id: string,
  ): Promise<Conversation> {
    const userId = this.userObjectId(user);
    const conversation = isValidObjectId(id)
      ? await this.conversationModel.findOne({
          _id: id,
          $or: [{ ownerId: userId }, { requesterId: userId }],
        })
      : null;

    if (!conversation) {
      throw new NotFoundException({
        message: 'Conversation not found',
        code: ErrorCode.CONVERSATION_NOT_FOUND,
      });
    }

    return conversation;
  }

  private async findCursorOrFail(
    conversation: Conversation,
    messageId: string,
  ): Promise<Message> {
    const cursor = await this.messageModel.findOne({
      _id: messageId,
      conversationId: conversation._id,
    });

    if (!cursor) {
      throw new BadRequestException({
        message: 'The cursor message is not in this conversation',
        code: ErrorCode.INVALID_MESSAGE_CURSOR,
      });
    }

    return cursor;
  }

  private roleOf(conversation: Conversation, userId: string): ConversationRole {
    return String(conversation.ownerId) === userId ? 'owner' : 'requester';
  }

  private userObjectId(user: JwtPayload): Types.ObjectId {
    if (!isValidObjectId(user.sub)) {
      throw new UnauthorizedException();
    }

    return new Types.ObjectId(user.sub);
  }
}
