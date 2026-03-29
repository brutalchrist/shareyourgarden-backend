import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { User, UserSchema } from './schemas/user.schema';
import { AuthService } from './services/auth.service';
import { GoogleOAuthService } from './services/google-oauth.service';
import { UsersService } from './services/users.service';
import { GoogleAuthRateLimitGuard } from './guards/google-auth-rate-limit.guard';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleOAuthService,
    UsersService,
    GoogleAuthRateLimitGuard,
  ],
})
export class AuthModule {}
