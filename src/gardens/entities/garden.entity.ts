import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

class Product {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  quantity: number;
}

class Person {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;
}

class Location {
  @Prop({ required: true })
  type: string = 'Point';

  @Prop({ required: true })
  coordinates: number[];
}

@Schema({ timestamps: true })
export class Garden extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, default: [] })
  products: Product[] = [];

  @Prop({ required: true })
  owner: Person;

  @Prop({ required: true })
  location: Location;
}

export const GardenSchema = SchemaFactory.createForClass(Garden);
