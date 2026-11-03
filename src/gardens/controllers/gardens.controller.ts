import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/dtos/auth.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateGardenDto, UpdateGardenDto } from '../dtos/gardens.dto';
import { GardensService } from '../services/gardens.service';

@Controller('gardens')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class GardensController {
  constructor(private readonly gardensService: GardensService) {}

  @Get()
  findGardens(
    @Query('polygon') polygon: string,
    @Query('where') where: string,
  ) {
    return this.gardensService.findGardens(polygon, where);
  }

  // Must stay above GET /:id so "mine" is not taken as an id.
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(@Req() request: AuthenticatedRequest) {
    return this.gardensService.findMine(request.user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findById(@Param('id') id: string) {
    return this.gardensService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateGardenDto) {
    return this.gardensService.create(request.user, body);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateGardenDto,
  ) {
    return this.gardensService.update(request.user, id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.gardensService.remove(request.user, id);
  }
}
