import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LOCALES, type Locale } from '../../users/users.constants';

const IsPushEndpoint = () =>
  IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true });

export class PublicKeyDto {
  // VAPID public key, base64url, for `applicationServerKey`.
  publicKey: string;
}

export class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  auth: string;
}

// The browser's PushSubscription.toJSON(), plus the notification language.
export class SubscribeDto {
  @IsPushEndpoint()
  @MaxLength(2048)
  endpoint: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;

  @IsIn(LOCALES)
  locale: Locale;
}

export class UnsubscribeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  endpoint: string;
}

/**
 * What the service worker receives for a new message. It never carries the
 * message text, which would show on lock screens.
 */
export class MessagePushPayloadDto {
  type: 'message';
  conversationId: string;
  senderName: string;
  gardenName: string;
  // That subscription's locale.
  locale: Locale;
  // Conversations with unread messages, as `unread` in /conversations/summary.
  unread: number;
}
