import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';
import { UsersModule } from '../users/users.module';
import { GardensController } from './controllers/gardens.controller';
import {
  Conversation,
  ConversationSchema,
} from '../conversations/entities/conversation.entity';
import { Garden, GardenSchema } from './entities/garden.entity';
import { GardensService } from './services/gardens.service';
@Module({
  imports: [
    AuthModule,
    UsersModule,
    UploadsModule,
    MongooseModule.forFeature([
      { name: Garden.name, schema: GardenSchema },
      { name: Conversation.name, schema: ConversationSchema },
    ]),
  ],
  controllers: [GardensController],
  providers: [GardensService],
})
export class GardensModule {}
