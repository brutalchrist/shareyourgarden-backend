import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  PRODUCT_TYPES,
  PRODUCT_UNITS,
  type ProductType,
  type ProductUnit,
} from '../gardens.constants';
import { MAX_IMAGES_PER_PRODUCT } from '../../uploads/uploads.constants';

// Like @IsOptional, but only for omitted fields: an explicit null still fails validation.
const IsOmittable = () => ValidateIf((_, value) => value !== undefined);

const IsLngLat = () =>
  ValidateBy({
    name: 'isLngLat',
    validator: {
      validate: (value: unknown) =>
        Array.isArray(value) &&
        value.length === 2 &&
        value.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
        Math.abs(value[0] as number) <= 180 &&
        Math.abs(value[1] as number) <= 90,
      defaultMessage: () =>
        '$property must be [lng, lat] with lng in [-180, 180] and lat in [-90, 90]',
    },
  });

export class ProductImageDto {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

export class ProductDto {
  name: string;
  type: ProductType;
  quantity: number;
  unit?: ProductUnit;
  // The first one is the cover.
  images: ProductImageDto[];
}

export class PersonDto {
  name: string;
  // Only sent to the garden's owner.
  email?: string;
  // The owner's current profile picture, when they have one.
  picture?: string;
}

export class LocationDto {
  type: 'Point';
  coordinates: number[];
}

export class GardenDto {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  products: ProductDto[];
  owner: PersonDto;
  ownerId: string | null;
  location: LocationDto;
  createdAt?: Date;
  updatedAt?: Date;
}

export class ProductImageInputDto {
  @IsUUID()
  id: string;
}

export class ProductInputDto {
  @IsString()
  @Length(1, 60)
  name: string;

  @IsIn(PRODUCT_TYPES)
  type: ProductType;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOmittable()
  @IsIn(PRODUCT_UNITS)
  unit?: ProductUnit;

  // Ids from POST /uploads/images, or of photos the garden already has. The
  // order is kept and the first one is the cover. Omitted means no photos.
  @IsOmittable()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES_PER_PRODUCT)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images?: ProductImageInputDto[];
}

export class LocationInputDto {
  @IsIn(['Point'])
  type: 'Point';

  @IsLngLat()
  coordinates: number[];
}

export class CreateGardenDto {
  @IsString()
  @Length(1, 80)
  name: string;

  @IsOmittable()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOmittable()
  @IsBoolean()
  active?: boolean;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProductInputDto)
  products: ProductInputDto[];

  @IsObject()
  @ValidateNested()
  @Type(() => LocationInputDto)
  location: LocationInputDto;
}

export class UpdateGardenDto {
  @IsOmittable()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOmittable()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOmittable()
  @IsBoolean()
  active?: boolean;

  @IsOmittable()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProductInputDto)
  products?: ProductInputDto[];

  @IsOmittable()
  @IsObject()
  @ValidateNested()
  @Type(() => LocationInputDto)
  location?: LocationInputDto;
}
