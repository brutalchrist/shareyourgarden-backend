const gardenMock = {
  name: 'Jardin 1',
  description: 'Huerto comunitario',
  active: true,
  products: [
    {
      name: 'Manzana roja',
      type: 'fruit',
      quantity: 5,
      unit: 'kg',
    },
    {
      name: 'Lechuga',
      type: 'vegetable',
      quantity: 10,
      unit: 'unit',
    },
  ],
  owner: {
    name: 'Juan Pérez',
    email: 'juan.perez@example.com',
  },
  ownerId: '64b7f0c2a1b2c3d4e5f60718',
  location: {
    type: 'Point',
    coordinates: [-71.66, -35.43],
  },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

export const gardenEntityMock = {
  _id: '67aaccbd70ce46590ad81696',
  ...gardenMock,
};

export const gardenDtoMock = {
  id: '67aaccbd70ce46590ad81696',
  ...gardenMock,
  products: gardenMock.products.map((product) => ({ ...product, images: [] })),
};
