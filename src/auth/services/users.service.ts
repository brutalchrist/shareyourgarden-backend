import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  roles: string[];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findOrCreateFromGoogle(profile: GoogleProfile): Promise<AuthUser> {
    const normalizedEmail = profile.email.toLowerCase();

    const userBySub = await this.userModel.findOne({ googleSub: profile.sub });
    if (userBySub) {
      userBySub.name = profile.name;
      userBySub.picture = profile.picture;
      userBySub.email = normalizedEmail;
      userBySub.provider = 'google';
      const saved = await userBySub.save();
      return this.toAuthUser(saved);
    }

    const userByEmail = await this.userModel.findOne({
      email: normalizedEmail,
    });
    if (userByEmail) {
      userByEmail.name = profile.name;
      userByEmail.picture = profile.picture;
      userByEmail.googleSub = profile.sub;
      userByEmail.provider = 'google';
      const saved = await userByEmail.save();
      return this.toAuthUser(saved);
    }

    const created = await this.userModel.create({
      name: profile.name,
      email: normalizedEmail,
      picture: profile.picture,
      googleSub: profile.sub,
      provider: 'google',
      roles: ['user'],
    });

    return this.toAuthUser(created);
  }

  private toAuthUser(user: UserDocument): AuthUser {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      picture: user.picture,
      roles: user.roles ?? ['user'],
    };
  }
}
