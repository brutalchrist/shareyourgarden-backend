import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { GoogleAuthRateLimitGuard } from './guards/google-auth-rate-limit.guard';
import { AuthService } from './services/auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google/start')
  @UseGuards(GoogleAuthRateLimitGuard)
  startGoogleAuth(@Query('return_to') returnTo: string, @Res() res: Response) {
    this.authService.startGoogleAuth(returnTo, res);
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthRateLimitGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    await this.authService.handleGoogleCallback(req, res);
  }

  @Get('session')
  getSession(@Req() req: Request) {
    return this.authService.getSession(req);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req, res);
  }
}
