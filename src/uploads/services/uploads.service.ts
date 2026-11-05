import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import { JwtPayload } from '../../auth/dtos/auth.dto';
import { ErrorCode } from '../../common/errors';
import { StorageService } from '../../storage/storage.service';
import { CreateImageUploadDto, ImageUploadDto } from '../dtos/uploads.dto';
import { Upload } from '../entities/upload.entity';
import { MAX_UPLOADS_PER_HOUR, tmpImageKey } from '../uploads.constants';

@Injectable()
export class UploadsService {
  constructor(
    @InjectModel(Upload.name) private uploadModel: Model<Upload>,
    private readonly storage: StorageService,
  ) {}

  /**
   * Reserves an image id and signs the two PUTs (full size and thumbnail)
   * the browser makes straight to the bucket's `tmp/` prefix.
   */
  async createImageUpload(
    user: JwtPayload,
    body: CreateImageUploadDto,
  ): Promise<ImageUploadDto> {
    this.storage.assertEnabled();

    if (!isValidObjectId(user.sub)) {
      throw new UnauthorizedException();
    }
    const userId = new Types.ObjectId(user.sub);
    await this.assertUnderUploadLimit(userId);

    const imageId = randomUUID();
    await this.uploadModel.create({
      imageId,
      userId,
      contentType: body.contentType,
      width: body.width,
      height: body.height,
    });

    const headers = { 'Content-Type': body.contentType };
    const [fullUrl, thumbUrl] = await Promise.all([
      this.storage.presignPut(
        tmpImageKey(imageId, 'full'),
        body.contentType,
        body.fullSize,
      ),
      this.storage.presignPut(
        tmpImageKey(imageId, 'thumb'),
        body.contentType,
        body.thumbSize,
      ),
    ]);

    return {
      id: imageId,
      full: { url: fullUrl, headers },
      thumb: { url: thumbUrl, headers },
      previewUrl: this.storage.publicUrl(tmpImageKey(imageId, 'thumb'))!,
    };
  }

  /**
   * The user's uploads among `imageIds` that no garden has claimed yet,
   * keyed by image id.
   */
  async findClaimable(
    user: JwtPayload,
    imageIds: string[],
  ): Promise<Map<string, Upload>> {
    if (imageIds.length === 0 || !isValidObjectId(user.sub)) {
      return new Map();
    }

    const uploads = await this.uploadModel.find({
      imageId: { $in: imageIds },
      userId: new Types.ObjectId(user.sub),
      gardenId: null,
    });

    return new Map(uploads.map((upload) => [upload.imageId, upload]));
  }

  async markClaimed(
    imageIds: string[],
    gardenId: Types.ObjectId,
  ): Promise<void> {
    if (imageIds.length === 0) {
      return;
    }

    await this.uploadModel.updateMany(
      { imageId: { $in: imageIds } },
      { $set: { gardenId } },
    );
  }

  private async assertUnderUploadLimit(userId: Types.ObjectId): Promise<void> {
    const recent = await this.uploadModel.countDocuments({
      userId,
      createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    if (recent >= MAX_UPLOADS_PER_HOUR) {
      throw new HttpException(
        {
          message: 'Too many photo uploads; try again later',
          code: ErrorCode.TOO_MANY_UPLOADS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
