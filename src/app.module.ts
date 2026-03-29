import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { env } from 'process';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { GardensModule } from './gardens/gardens.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    GardensModule,
    AuthModule,
    MongooseModule.forRoot(
      env.MONGODB_URI || 'mongodb://localhost:27017/shareyourgarden',
    ),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
