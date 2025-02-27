import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GardensController } from './controllers/gardens.controller';
import { Garden, GardenSchema } from './entities/garden.entity';
import { GardensService } from './services/gardens.service';
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Garden.name, schema: GardenSchema }]),
  ],
  controllers: [GardensController],
  providers: [GardensService],
})
export class GardensModule {}
