import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/dtos/auth.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SubscribeDto, UnsubscribeDto } from '../dtos/push.dto';
import { PushService } from '../services/push.service';

@Controller('push')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('public-key')
  getPublicKey() {
    return this.pushService.getPublicKey();
  }

  @Post('subscriptions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  subscribe(@Req() request: AuthenticatedRequest, @Body() body: SubscribeDto) {
    return this.pushService.subscribe(request.user, body);
  }

  @Delete('subscriptions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  unsubscribe(
    @Req() request: AuthenticatedRequest,
    @Body() body: UnsubscribeDto,
  ) {
    return this.pushService.unsubscribe(request.user, body);
  }
}
