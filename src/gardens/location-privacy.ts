// Side of the grid cell a public location is snapped to, in meters.
export const APPROXIMATE_CELL_METERS = 500;

const METERS_PER_DEGREE_LAT = 111_320;
const MAX_LAT = 89;

/**
 * Snaps a [lng, lat] point to the center of its grid cell. Every point in a
 * cell gives the same answer, so it is stable across requests and cannot be
 * averaged or reversed to the original point. It stays within about 350 m of
 * it, enough for the map and the search by area.
 */
export function approximateCoordinates(coordinates: number[]): number[] {
  if (!coordinates || coordinates.length < 2) {
    return coordinates;
  }

  const [lng, lat] = coordinates;
  const latStep = APPROXIMATE_CELL_METERS / METERS_PER_DEGREE_LAT;
  const row = Math.floor(lat / latStep);
  const approxLat = Math.max(
    -MAX_LAT,
    Math.min(MAX_LAT, (row + 0.5) * latStep),
  );
  // Cells get narrower in degrees of longitude away from the equator; the
  // width is taken from the row's center so every point in a row agrees.
  const lngStep = latStep / Math.cos((approxLat * Math.PI) / 180);
  const approxLng = (Math.floor(lng / lngStep) + 0.5) * lngStep;

  return [approxLng, approxLat];
}
