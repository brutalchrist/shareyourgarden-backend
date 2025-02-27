import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GardensModule } from './gardens/gardens.module';

@Module({
  imports: [
    GardensModule,
    MongooseModule.forRoot(
      'mongodb+srv://brutalchrist:wpgC5pc43qiyPrbC@cluster0.p5w4m.mongodb.net/shareyourgarden',
    ),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
