import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GardensDto } from '../dtos/gardens.dto';
import { Garden } from '../entities/garden.entity';

@Injectable()
export class GardensService {
  constructor(@InjectModel(Garden.name) private gardenModel: Model<Garden>) {}

  mapEntityToDto(garden: Garden): GardensDto {
    const response = new GardensDto();
    response.id = garden._id as string;
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
      throw new Error(`Invalid polygon format: ${error}`);
    }

    if (!Array.isArray(coordinates)) {
      throw new Error('polygon: an array was expected');
    }

    if (coordinates.length < 4) {
      throw new Error('polygon: a minimum of 4 points was expected');
    }

    const $regex = `.*${where}.*`;
    const $options = 'i';

    const gardens = await this.gardenModel.find({
      $or: [
        { name: { $regex, $options } },
        { 'products.name': { $regex, $options } },
        { 'products.type': { $regex, $options } },
        { 'owner.name': { $regex, $options } },
      ],
      location: {
        $geoWithin: {
          $geometry: {
            type: 'Polygon',
            coordinates: [coordinates],
          },
        },
      },
    });

    return gardens.map((garden) => this.mapEntityToDto(garden));
  }
}
