// Stable codes stored and exchanged with clients; the UI maps them to labels.
export const PRODUCT_TYPES = [
  'seed',
  'seedbed',
  'fruit',
  'vegetable',
  'herb',
  'flower',
  // Growing inputs such as worm humus, rooting hormone or compost.
  'supply',
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_UNITS = ['unit', 'kg', 'g', 'bunch', 'l'] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];
