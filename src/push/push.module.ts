import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { PushController } from './controllers/push.controller';
import {
  PushSubscription,
  PushSubscriptionSchema,
} from './entities/push-subscription.entity';
import { PushService } from './services/push.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: PushSubscription.name, schema: PushSubscriptionSchema },
    ]),
  ],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
