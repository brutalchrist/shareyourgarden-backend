const gardenMock = {
  name: 'Jardin 1',
  products: [
    {
      name: 'Manzana roja',
      type: 'Fruta',
      quantity: 5,
    },
    {
      name: 'Lechuga',
      type: 'Vegetal',
      quantity: 10,
    },
  ],
  owner: {
    name: 'Juan Pérez',
    email: 'juan.perez@example.com',
  },
  location: {
    type: 'Point',
    coordinates: [-71.66, -35.43],
  },
};

export const gardenEntityMock = {
  _id: '67aaccbd70ce46590ad81696',
  ...gardenMock,
};

export const gardenDtoMock = {
  id: '67aaccbd70ce46590ad81696',
  ...gardenMock,
};
