import { Mongoose, Types } from 'mongoose';
import { Garden, GardenSchema } from './garden.entity';

const GardenModel = new Mongoose().model(Garden.name, GardenSchema);

const garden = (product: Record<string, unknown>) =>
  new GardenModel({
    ownerId: new Types.ObjectId(),
    name: 'Huerto',
    products: [{ name: 'Tomate', quantity: 1, ...product }],
    owner: { name: 'Jane', email: 'jane@example.com' },
    location: { type: 'Point', coordinates: [-71.66, -35.43] },
  });

describe('GardenSchema', () => {
  it('stores ownerId as an ObjectId', () => {
    expect(GardenSchema.path('ownerId').instance).toBe('ObjectId');
  });

  it('accepts known product type and unit codes', () => {
    expect(
      garden({ type: 'vegetable', unit: 'kg' }).validateSync(),
    ).toBeUndefined();
    expect(garden({ type: 'supply' }).validateSync()).toBeUndefined();
  });

  it('rejects unknown product type and unit codes', () => {
    const error = garden({ type: 'Verdura', unit: 'kilos' }).validateSync();

    expect(Object.keys(error?.errors ?? {}).sort()).toEqual([
      'products.0.type',
      'products.0.unit',
    ]);
  });
});
