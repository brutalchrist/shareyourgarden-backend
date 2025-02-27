import { Controller, Get, Query } from '@nestjs/common';
import { GardensService } from '../services/gardens.service';

@Controller('gardens')
export class GardensController {
  constructor(private readonly gardensService: GardensService) {}

  @Get()
  findGardens(
    @Query('polygon') polygon: string,
    @Query('where') where: string,
  ) {
    return this.gardensService.findGardens(polygon, where);
  }
}
