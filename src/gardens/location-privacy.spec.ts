import {
  APPROXIMATE_CELL_METERS,
  approximateCoordinates,
} from './location-privacy';

const metersBetween = ([lng1, lat1]: number[], [lng2, lat2]: number[]) => {
  const dLat = (lat2 - lat1) * 111_320;
  const dLng = (lng2 - lng1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

describe('approximateCoordinates', () => {
  it('is stable for the same point', () => {
    expect(approximateCoordinates([-71.66, -35.43])).toEqual(
      approximateCoordinates([-71.66, -35.43]),
    );
  });

  it('does not return the exact point', () => {
    expect(approximateCoordinates([-71.66, -35.43])).not.toEqual([
      -71.66, -35.43,
    ]);
  });

  it('gives the same answer for points in the same cell', () => {
    const [lng, lat] = [-71.66, -35.43];
    const near = [lng + 0.00001, lat + 0.00001];

    expect(approximateCoordinates(near)).toEqual(
      approximateCoordinates([lng, lat]),
    );
  });

  it.each([
    [-71.66, -35.43],
    [0.0001, 0.0001],
    [139.69, 35.68],
    [-122.42, 37.77],
    [10.5, 68.2],
  ])('stays near the original at %s, %s', (lng, lat) => {
    const approximate = approximateCoordinates([lng, lat]);

    expect(metersBetween([lng, lat], approximate)).toBeLessThan(
      APPROXIMATE_CELL_METERS,
    );
  });

  it('keeps latitude within the valid range at the poles', () => {
    const [, lat] = approximateCoordinates([10, 90]);

    expect(Math.abs(lat)).toBeLessThanOrEqual(89);
  });
});
