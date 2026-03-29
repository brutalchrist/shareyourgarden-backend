import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { GoogleAuthRateLimitGuard } from './guards/google-auth-rate-limit.guard';
import { User, UserSchema } from './schemas/user.schema';
import { AuthFlowService } from './services/auth-flow.service';
import { AuthService } from './services/auth.service';
import { CookieService } from './services/cookie.service';
import { GoogleOAuthService } from './services/google-oauth.service';
import { SessionService } from './services/session.service';
import { UsersService } from './services/users.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthFlowService,
    CookieService,
    GoogleOAuthService,
    SessionService,
    UsersService,
    GoogleAuthRateLimitGuard,
  ],
})
export class AuthModule {}
