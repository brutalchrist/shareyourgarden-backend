import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { UploadsController } from './controllers/uploads.controller';
import { Upload, UploadSchema } from './entities/upload.entity';
import { UploadsService } from './services/uploads.service';

@Module({
  imports: [
    AuthModule,
    StorageModule,
    MongooseModule.forFeature([{ name: Upload.name, schema: UploadSchema }]),
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService, StorageModule],
})
export class UploadsModule {}
