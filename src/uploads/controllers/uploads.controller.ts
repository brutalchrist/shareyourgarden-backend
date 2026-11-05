import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/dtos/auth.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateImageUploadDto } from '../dtos/uploads.dto';
import { UploadsService } from '../services/uploads.service';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('images')
  createImageUpload(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateImageUploadDto,
  ) {
    return this.uploadsService.createImageUpload(request.user, body);
  }
}
