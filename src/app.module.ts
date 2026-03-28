import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GardensModule } from './gardens/gardens.module';
import { env } from 'process';

@Module({
  imports: [
    GardensModule,
    MongooseModule.forRoot(
      env.MONGODB_URI || 'mongodb://localhost:27017/shareyourgarden',
    ),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
