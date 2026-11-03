import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/dtos/auth.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  ListConversationsQueryDto,
  ListMessagesQueryDto,
  SendMessageDto,
  StartConversationDto,
} from '../dtos/conversations.dto';
import { ConversationsService } from '../services/conversations.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  start(
    @Req() request: AuthenticatedRequest,
    @Body() body: StartConversationDto,
  ) {
    return this.conversationsService.start(request.user, body);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListConversationsQueryDto,
  ) {
    return this.conversationsService.list(request.user, query);
  }

  // Must stay above GET /:id so "summary" is not taken as an id.
  @Get('summary')
  summary(@Req() request: AuthenticatedRequest) {
    return this.conversationsService.summary(request.user);
  }

  @Get(':id')
  findById(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.conversationsService.findById(request.user, id);
  }

  @Get(':id/messages')
  listMessages(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.conversationsService.listMessages(request.user, id, query);
  }

  @Post(':id/messages')
  sendMessage(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(request.user, id, body);
  }

  @Post(':id/read')
  @HttpCode(204)
  markRead(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.conversationsService.markRead(request.user, id);
  }
}
