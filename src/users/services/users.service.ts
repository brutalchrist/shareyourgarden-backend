import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { TokenPayload } from 'google-auth-library';
import { isValidObjectId, Model } from 'mongoose';
import { UserDto } from '../dtos/user.dto';
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
}
