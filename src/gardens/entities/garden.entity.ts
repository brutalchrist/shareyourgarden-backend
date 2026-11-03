import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/entities/user.entity';

@Schema({ _id: false })
export class Product {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop()
  unit?: string;
}

const ProductSchema = SchemaFactory.createForClass(Product);

@Schema({ _id: false })
export class Person {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;
}

const PersonSchema = SchemaFactory.createForClass(Person);

@Schema({ _id: false })
export class Location {
  @Prop({ required: true, enum: ['Point'], default: 'Point' })
  type: 'Point';

  @Prop({ type: [Number], required: true })
  coordinates: number[];
}

const LocationSchema = SchemaFactory.createForClass(Location);

@Schema({ timestamps: true })
export class Garden extends Document {
  // Legacy gardens may lack an owner id; every garden created through the API sets it.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    index: true,
    required: true,
  })
  ownerId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ maxlength: 500 })
  description?: string;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: [ProductSchema], required: true, default: [] })
  products: Product[];

  @Prop({ type: PersonSchema, required: true })
  owner: Person;

  @Prop({ type: LocationSchema, required: true })
  location: Location;

  createdAt: Date;
  updatedAt: Date;
}

export const GardenSchema = SchemaFactory.createForClass(Garden);
GardenSchema.index({ location: '2dsphere' });
