import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { TokenPayload } from 'google-auth-library';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { JwtPayload } from '../../auth/dtos/auth.dto';
import { UpdateUserDto, UserDto } from '../dtos/user.dto';
import { User } from '../entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  private mapEntityToDto(user: User): UserDto {
    return {
      id: String(user._id),
      email: user.email,
      name: user.name,
      picture: user.picture,
      locale: user.locale ?? null,
    };
  }

  async upsertFromGoogle(payload: TokenPayload): Promise<UserDto> {
    const user = await this.userModel.findOneAndUpdate(
      { googleId: payload.sub },
      {
        $set: {
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );

    return this.mapEntityToDto(user);
  }

  async findById(id: string): Promise<UserDto | null> {
    if (!isValidObjectId(id)) {
      return null;
    }

    const user = await this.userModel.findById(id);

    return user ? this.mapEntityToDto(user) : null;
  }

  async block(userId: Types.ObjectId, otherId: Types.ObjectId): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { $addToSet: { blockedUserIds: otherId } },
    );
  }

  async unblock(
    userId: Types.ObjectId,
    otherId: Types.ObjectId,
  ): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { $pull: { blockedUserIds: otherId } },
    );
  }

  /**
   * Which of `otherIds` the user blocked, and which of them blocked the user,
   * in two indexed queries whatever the number of ids.
   */
  async blockRelations(
    userId: Types.ObjectId,
    otherIds: Types.ObjectId[],
  ): Promise<{ blockedByMe: Set<string>; blockedByThem: Set<string> }> {
    const [me, blockers] = await Promise.all([
      this.userModel.findById(userId, { blockedUserIds: 1 }).exec(),
      otherIds.length > 0
        ? this.userModel
            .find(
              { _id: { $in: otherIds }, blockedUserIds: userId },
              { _id: 1 },
            )
            .exec()
        : Promise.resolve([]),
    ]);

    return {
      blockedByMe: new Set((me?.blockedUserIds ?? []).map(String)),
      blockedByThem: new Set(blockers.map((user) => String(user._id))),
    };
  }

  async updateMe(user: JwtPayload, body: UpdateUserDto): Promise<UserDto> {
    const updated = isValidObjectId(user.sub)
      ? await this.userModel.findByIdAndUpdate(
          user.sub,
          // Omitted fields stay untouched; null is a value (clears locale).
          { $set: body.locale === undefined ? {} : { locale: body.locale } },
          { returnDocument: 'after', runValidators: true },
        )
      : null;

    if (!updated) {
      throw new UnauthorizedException();
    }

    return this.mapEntityToDto(updated);
  }
}
