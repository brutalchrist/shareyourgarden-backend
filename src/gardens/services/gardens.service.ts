import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GardensDto } from '../dtos/gardens.dto';
import { Garden } from '../entities/garden.entity';

type Box = [[number, number], [number, number]];

@Injectable()
export class GardensService {
  constructor(@InjectModel(Garden.name) private gardenModel: Model<Garden>) {}

  mapEntityToDto(garden: Garden): GardensDto {
    const response = new GardensDto();
    response.id = String(garden._id);
    response.name = garden.name;
    response.products = garden.products;
    response.owner = garden.owner;
    response.location = garden.location;
    return response;
  }

  async findGardens(polygon: string, where?: string): Promise<GardensDto[]> {
    let coordinates: number[][];
    try {
      coordinates = JSON.parse(polygon) as number[][];
    } catch (error) {
      throw new BadRequestException(`Invalid polygon format: ${error}`, {
        cause: error,
      });
    }

    if (!Array.isArray(coordinates)) {
      throw new BadRequestException('polygon: an array was expected');
    }

    if (coordinates.length < 4) {
      throw new BadRequestException(
        'polygon: a minimum of 4 points was expected',
      );
    }

    const isPoint = (point: unknown): point is [number, number] =>
      Array.isArray(point) &&
      point.length >= 2 &&
      point.slice(0, 2).every((value) => Number.isFinite(value));
    if (!coordinates.every(isPoint)) {
      throw new BadRequestException(
        'polygon: every point must be a [longitude, latitude] pair of numbers',
      );
    }

    const boxes = this.viewportToBoxes(coordinates);

    const $regex = `.*${where}.*`;
    const $options = 'i';

    const gardens = await this.gardenModel.find({
      $and: [
        {
          $or: [
            { name: { $regex, $options } },
            { 'products.name': { $regex, $options } },
            { 'products.type': { $regex, $options } },
            { 'owner.name': { $regex, $options } },
          ],
        },
        {
          $or: boxes.map(($box) => ({ location: { $geoWithin: { $box } } })),
        },
      ],
    });

    return gardens.map((garden) => this.mapEntityToDto(garden));
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
