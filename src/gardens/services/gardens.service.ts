import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { ErrorCode } from '../../common/errors';
import { JwtPayload } from '../../auth/dtos/auth.dto';
import { UsersService } from '../../users/services/users.service';
import {
  CreateGardenDto,
  GardenDto,
  ProductImageDto,
  ProductInputDto,
  UpdateGardenDto,
} from '../dtos/gardens.dto';
import { Conversation } from '../../conversations/entities/conversation.entity';
import { StorageService } from '../../storage/storage.service';
import { UploadsService } from '../../uploads/services/uploads.service';
import {
  gardenImageKey,
  gardenImagePrefix,
  IMAGE_VARIANTS,
  tmpImageKey,
} from '../../uploads/uploads.constants';
import { Garden, Product, ProductImage } from '../entities/garden.entity';

type Box = [[number, number], [number, number]];

// Products as stored, with the photo ids resolved to their dimensions.
interface ResolvedProducts {
  products: Product[];
  // Photos copied from `tmp/` that the garden now uses.
  addedIds: string[];
  // Photos the garden had and no longer uses.
  removedIds: string[];
}

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class GardensService {
  private readonly logger = new Logger(GardensService.name);

  constructor(
    @InjectModel(Garden.name) private gardenModel: Model<Garden>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<Conversation>,
    private readonly usersService: UsersService,
    private readonly uploadsService: UploadsService,
    private readonly storage: StorageService,
  ) {}

  /**
   * The owner's email is private: it is only included for the owner
   * (`includeEmail`), and visitors contact them through conversations.
   */
  mapEntityToDto(garden: Garden, { includeEmail = false } = {}): GardenDto {
    const response = new GardenDto();
    response.id = String(garden._id);
    response.name = garden.name;
    response.description = garden.description;
    response.active = garden.active ?? true;
    const gardenId = String(garden._id);
    response.products = (garden.products ?? []).map(
      ({ name, type, quantity, unit, images }) => ({
        name,
        type,
        quantity,
        unit,
        images: this.mapImages(gardenId, images),
      }),
    );
    response.owner = {
      name: garden.owner?.name,
      ...(includeEmail ? { email: garden.owner?.email } : {}),
    };
    response.ownerId = garden.ownerId ? String(garden.ownerId) : null;
    response.location = {
      type: 'Point',
      coordinates: garden.location?.coordinates,
    };
    response.createdAt = garden.createdAt;
    response.updatedAt = garden.updatedAt;
    return response;
  }

  async findGardens(polygon: string, where?: string): Promise<GardenDto[]> {
    let coordinates: number[][];
    try {
      coordinates = JSON.parse(polygon) as number[][];
    } catch (error) {
      throw new BadRequestException(
        {
          message: `Invalid polygon format: ${error}`,
          code: ErrorCode.INVALID_POLYGON,
        },
        { cause: error },
      );
    }

    if (!Array.isArray(coordinates)) {
      throw new BadRequestException({
        message: 'polygon: an array was expected',
        code: ErrorCode.INVALID_POLYGON,
      });
    }

    if (coordinates.length < 4) {
      throw new BadRequestException({
        message: 'polygon: a minimum of 4 points was expected',
        code: ErrorCode.INVALID_POLYGON,
      });
    }

    const isPoint = (point: unknown): point is [number, number] =>
      Array.isArray(point) &&
      point.length >= 2 &&
      point.slice(0, 2).every((value) => Number.isFinite(value));
    if (!coordinates.every(isPoint)) {
      throw new BadRequestException({
        message:
          'polygon: every point must be a [longitude, latitude] pair of numbers',
        code: ErrorCode.INVALID_POLYGON,
      });
    }

    const boxes = this.viewportToBoxes(coordinates);

    const $regex = escapeRegex(where ?? '');
    const $options = 'i';

    const gardens = await this.gardenModel.find({
      $and: [
        {
          $or: [
            { name: { $regex, $options } },
            { 'products.name': { $regex, $options } },
            { 'owner.name': { $regex, $options } },
          ],
        },
        {
          $or: boxes.map(($box) => ({ location: { $geoWithin: { $box } } })),
        },
        // Legacy gardens without the field count as active.
        { active: { $ne: false } },
      ],
    });

    return gardens.map((garden) => this.mapEntityToDto(garden));
  }

  async findMine(user: JwtPayload): Promise<GardenDto[]> {
    if (!isValidObjectId(user.sub)) {
      return [];
    }

    const gardens = await this.gardenModel
      .find({ ownerId: user.sub })
      .sort({ updatedAt: -1 })
      .exec();

    return gardens.map((garden) =>
      this.mapEntityToDto(garden, { includeEmail: true }),
    );
  }

  async findById(user: JwtPayload, id: string): Promise<GardenDto> {
    const garden = await this.findGardenOrFail(id);

    return this.mapEntityToDto(garden, {
      includeEmail: this.isOwner(user, garden),
    });
  }

  async create(user: JwtPayload, body: CreateGardenDto): Promise<GardenDto> {
    const owner = await this.usersService.findById(user.sub);

    if (!owner) {
      throw new UnauthorizedException();
    }

    // The id is needed up front: it names the folder the photos go to.
    const gardenId = new Types.ObjectId();
    const { products, addedIds } = await this.resolveProducts(
      user,
      gardenId,
      [],
      body.products,
    );

    const garden = await this.gardenModel.create({
      ...this.definedFields(body),
      _id: gardenId,
      products,
      ownerId: owner.id,
      owner: { name: owner.name || owner.email, email: owner.email },
    });
    await this.uploadsService.markClaimed(addedIds, gardenId);

    return this.mapEntityToDto(garden, { includeEmail: true });
  }

  async update(
    user: JwtPayload,
    id: string,
    body: UpdateGardenDto,
  ): Promise<GardenDto> {
    const garden = await this.findOwnedGardenOrFail(user, id);
    const fields = this.definedFields(body);
    let resolved: ResolvedProducts | null = null;

    if (body.products !== undefined) {
      resolved = await this.resolveProducts(
        user,
        garden._id,
        garden.products ?? [],
        body.products,
      );
      fields.products = resolved.products;
    }

    garden.set(fields);
    await garden.save();

    if (resolved) {
      await this.uploadsService.markClaimed(resolved.addedIds, garden._id);
      await this.deleteImages(String(garden._id), resolved.removedIds);
    }

    return this.mapEntityToDto(garden, { includeEmail: true });
  }

  async remove(user: JwtPayload, id: string): Promise<void> {
    const garden = await this.findOwnedGardenOrFail(user, id);

    await garden.deleteOne();
    // Conversations about it stay readable but nobody can write anymore.
    await this.conversationModel.updateMany(
      { gardenId: garden._id },
      { $set: { gardenDeleted: true } },
    );

    if (this.storage.enabled) {
      // Best effort: the garden is gone either way.
      await this.storage
        .deletePrefix(gardenImagePrefix(String(garden._id)))
        .catch((error: unknown) =>
          this.logger.error(`Could not delete photos of garden ${id}`, error),
        );
    }
  }

  /**
   * Turns the products sent by the owner into stored products. Photo ids the
   * garden already has keep their dimensions. New ones must be uploads of
   * this user that no garden claimed yet, with both files in `tmp/`; their
   * files are copied to the garden's folder before it's saved.
   */
  private async resolveProducts(
    user: JwtPayload,
    gardenId: Types.ObjectId,
    current: Product[],
    input: ProductInputDto[],
  ): Promise<ResolvedProducts> {
    const existing = new Map<string, ProductImage>(
      current.flatMap((product) =>
        (product.images ?? []).map((image) => [image.id, image] as const),
      ),
    );
    const requestedIds = input.flatMap((product) =>
      (product.images ?? []).map((image) => image.id),
    );

    if (new Set(requestedIds).size !== requestedIds.length) {
      throw new BadRequestException({
        message: 'The same photo is used more than once',
        code: ErrorCode.DUPLICATE_IMAGE,
      });
    }

    const addedIds = requestedIds.filter((id) => !existing.has(id));
    const added = new Map<string, ProductImage>();

    if (addedIds.length > 0) {
      this.storage.assertEnabled();
      const uploads = await this.uploadsService.findClaimable(user, addedIds);
      const missing = addedIds.find((id) => !uploads.has(id));
      if (missing) {
        throw new BadRequestException({
          message: `Unknown photo ${missing}`,
          code: ErrorCode.INVALID_IMAGE,
        });
      }

      await Promise.all(
        addedIds.map(async (id) => {
          const sizes = await Promise.all(
            IMAGE_VARIANTS.map((variant) =>
              this.storage.headSize(tmpImageKey(id, variant)),
            ),
          );
          if (sizes.some((size) => size === null)) {
            throw new BadRequestException({
              message: `Photo ${id} was not uploaded`,
              code: ErrorCode.IMAGE_NOT_UPLOADED,
            });
          }
        }),
      );

      await Promise.all(
        addedIds.flatMap((id) => {
          const upload = uploads.get(id)!;
          added.set(id, { id, width: upload.width, height: upload.height });
          return IMAGE_VARIANTS.map((variant) =>
            this.storage.copy(
              tmpImageKey(id, variant),
              gardenImageKey(String(gardenId), id, variant),
              upload.contentType,
            ),
          );
        }),
      );
    }

    const requested = new Set(requestedIds);
    const products = input.map(({ name, type, quantity, unit, images }) => ({
      name,
      type,
      quantity,
      ...(unit !== undefined ? { unit } : {}),
      images: (images ?? []).map(({ id }) => {
        const image = existing.get(id) ?? added.get(id)!;
        return { id, width: image.width, height: image.height };
      }),
    }));

    return {
      products,
      addedIds,
      removedIds: [...existing.keys()].filter((id) => !requested.has(id)),
    };
  }

  // Best effort: a failure leaves unused files behind but the save stands.
  private async deleteImages(gardenId: string, imageIds: string[]) {
    if (imageIds.length === 0 || !this.storage.enabled) {
      return;
    }

    await this.storage
      .deleteKeys(
        imageIds.flatMap((id) =>
          IMAGE_VARIANTS.map((variant) =>
            gardenImageKey(gardenId, id, variant),
          ),
        ),
      )
      .catch((error: unknown) =>
        this.logger.error(
          `Could not delete removed photos of garden ${gardenId}`,
          error,
        ),
      );
  }

  // Without storage there are no URLs to give, so photos are left out.
  private mapImages(
    gardenId: string,
    images: ProductImage[] | undefined,
  ): ProductImageDto[] {
    if (!this.storage.enabled) {
      return [];
    }

    return (images ?? []).map(({ id, width, height }) => ({
      id,
      url: this.storage.publicUrl(gardenImageKey(gardenId, id, 'full'))!,
      thumbUrl: this.storage.publicUrl(gardenImageKey(gardenId, id, 'thumb'))!,
      width,
      height,
    }));
  }

  private async findGardenOrFail(id: string): Promise<Garden> {
    const garden = isValidObjectId(id)
      ? await this.gardenModel.findById(id)
      : null;

    if (!garden) {
      throw new NotFoundException({
        message: 'Garden not found',
        code: ErrorCode.GARDEN_NOT_FOUND,
      });
    }

    return garden;
  }

  private async findOwnedGardenOrFail(
    user: JwtPayload,
    id: string,
  ): Promise<Garden> {
    const garden = await this.findGardenOrFail(id);

    if (!this.isOwner(user, garden)) {
      throw new ForbiddenException({
        message: 'You do not own this garden',
        code: ErrorCode.GARDEN_NOT_OWNED,
      });
    }

    return garden;
  }

  private isOwner(user: JwtPayload, garden: Garden): boolean {
    return !!garden.ownerId && String(garden.ownerId) === user.sub;
  }

  // Validated DTO instances carry every declared field, so drop the omitted
  // ones before handing them to Mongoose.
  private definedFields<T extends object>(body: T): Partial<T> {
    return Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined),
    ) as Partial<T>;
  }

  /**
   * The polygon is the map viewport, a longitude/latitude rectangle that may
   * extend past ±180 when the map wraps. A GeoJSON $geometry polygon would be
   * read with geodesic edges (and Mongo picks the smaller region for polygons
   * bigger than a hemisphere), so the viewport is reduced to its bounding box
   * and queried with flat $box semantics instead, split in two when it crosses
   * the antimeridian.
   */
  private viewportToBoxes(coordinates: number[][]): Box[] {
    const lngs = coordinates.map(([lng]) => lng);
    const lats = coordinates.map(([, lat]) => lat);
    const clampLat = (lat: number) => Math.min(90, Math.max(-90, lat));
    const south = clampLat(Math.min(...lats));
    const north = clampLat(Math.max(...lats));
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    if (maxLng - minLng >= 360) {
      return [
        [
          [-180, south],
          [180, north],
        ],
      ];
    }

    const normalizeLng = (lng: number) =>
      lng >= -180 && lng <= 180
        ? lng
        : ((((lng + 180) % 360) + 360) % 360) - 180;
    const west = normalizeLng(minLng);
    const east = normalizeLng(maxLng);

    if (west <= east) {
      return [
        [
          [west, south],
          [east, north],
        ],
      ];
    }

    return [
      [
        [west, south],
        [180, north],
      ],
      [
        [-180, south],
        [east, north],
      ],
    ];
  }
}
