import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Garden, GardenSchema } from '../gardens/entities/garden.entity';
import { PushModule } from '../push/push.module';
import { UsersModule } from '../users/users.module';
import { ConversationsController } from './controllers/conversations.controller';
import {
  Conversation,
  ConversationSchema,
} from './entities/conversation.entity';
import { Message, MessageSchema } from './entities/message.entity';
import { ConversationsService } from './services/conversations.service';

@Module({
  imports: [
    AuthModule,
    PushModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Garden.name, schema: GardenSchema },
    ]),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
