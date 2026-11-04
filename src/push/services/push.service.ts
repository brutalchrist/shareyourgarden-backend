import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { sendNotification, setVapidDetails, WebPushError } from 'web-push';
import { JwtPayload } from '../../auth/dtos/auth.dto';
import { ErrorCode } from '../../common/errors';
import {
  MessagePushPayloadDto,
  PublicKeyDto,
  SubscribeDto,
  UnsubscribeDto,
} from '../dtos/push.dto';
import { PushSubscription } from '../entities/push-subscription.entity';

// A message notification is stale after a day.
const PUSH_TTL_SECONDS = 24 * 60 * 60;

export type MessagePushContent = Omit<MessagePushPayloadDto, 'locale'>;

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly publicKey: string | null = null;

  constructor(
    @InjectModel(PushSubscription.name)
    private pushSubscriptionModel: Model<PushSubscription>,
    config: ConfigService,
  ) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    const subject = config.get<string>('VAPID_SUBJECT');

    // Push is optional: without keys the app still runs, only without it.
    if (!publicKey || !privateKey || !subject) {
      this.logger.warn(
        'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT is missing; push notifications are disabled',
      );
      return;
    }

    try {
      setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
    } catch (error) {
      this.logger.error(
        `Invalid VAPID configuration; push notifications are disabled: ${String(error)}`,
      );
    }
  }

  get enabled(): boolean {
    return this.publicKey !== null;
  }

  getPublicKey(): PublicKeyDto {
    return { publicKey: this.publicKeyOrFail() };
  }

  // An endpoint belongs to one browser install: subscribing again from it,
  // even as someone else, takes it over.
  async subscribe(user: JwtPayload, body: SubscribeDto): Promise<void> {
    this.publicKeyOrFail();

    await this.pushSubscriptionModel.updateOne(
      { endpoint: body.endpoint },
      {
        $set: {
          user: this.userObjectId(user),
          keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
          locale: body.locale,
        },
      },
      { upsert: true, runValidators: true },
    );
  }

  async unsubscribe(user: JwtPayload, body: UnsubscribeDto): Promise<void> {
    this.publicKeyOrFail();

    await this.pushSubscriptionModel.deleteOne({
      endpoint: body.endpoint,
      user: this.userObjectId(user),
    });
  }

  /**
   * Notifies every device of `userId` about a new message. `content` is only
   * built when there is someone to send to. Never throws: failures are
   * logged, and subscriptions the push service no longer knows are removed.
   */
  async notifyMessage(
    userId: Types.ObjectId,
    content: () => Promise<MessagePushContent>,
  ): Promise<void> {
    if (!this.enabled) {
      this.logger.debug('Push notifications are not configured; skipping');
      return;
    }

    try {
      const subscriptions = await this.pushSubscriptionModel
        .find({ user: userId })
        .exec();
      if (subscriptions.length === 0) {
        return;
      }

      const payload = await content();
      await Promise.all(
        subscriptions.map((subscription) =>
          this.send(subscription, { ...payload, locale: subscription.locale }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Could not send push notifications: ${String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async send(
    subscription: PushSubscription,
    payload: MessagePushPayloadDto,
  ): Promise<void> {
    try {
      await sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        },
        JSON.stringify(payload),
        {
          TTL: PUSH_TTL_SECONDS,
          urgency: 'normal',
          // A newer push for the same conversation replaces a pending one.
          // Object ids are 24 hex characters, valid base64url within 32.
          topic: payload.conversationId,
        },
      );
    } catch (error) {
      if (
        error instanceof WebPushError &&
        (error.statusCode === 404 || error.statusCode === 410)
      ) {
        // The browser unsubscribed or the subscription expired.
        await this.pushSubscriptionModel.deleteOne({ _id: subscription._id });
        return;
      }

      this.logger.error(
        `Push to ${new URL(subscription.endpoint).host} failed: ${String(error)}`,
      );
    }
  }

  private publicKeyOrFail(): string {
    if (this.publicKey === null) {
      throw new ServiceUnavailableException({
        message: 'Push notifications are not configured',
        code: ErrorCode.PUSH_NOT_CONFIGURED,
      });
    }

    return this.publicKey;
  }

  private userObjectId(user: JwtPayload): Types.ObjectId {
    if (!isValidObjectId(user.sub)) {
      throw new UnauthorizedException();
    }

    return new Types.ObjectId(user.sub);
  }
}
