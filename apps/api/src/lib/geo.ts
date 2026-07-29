import { config } from '../config.js';

/**
 * Snap coordinates to a fixed grid before they ever reach the database.
 *
 * Precise coordinates are never persisted, so a database compromise
 * cannot reveal anyone's home address. Snapping on WRITE (not read) is
 * what makes this hold — a read-time blur is undone by averaging
 * repeated queries.
 */
export function snapToGrid(lat: number, lng: number) {
  const meters = config.LOCATION_GRID_METERS;
  const latStep = meters / 111_320;
  // Longitude degrees shrink toward the poles; scale by cos(lat) so the
  // cell stays roughly square in metres at any latitude.
  const lngStep = meters / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);

  return {
    lat: Math.round(lat / latStep) * latStep,
    lng: Math.round(lng / lngStep) * lngStep,
  };
}

const BUCKETS = [1000, 3000, 5000, 10_000, 25_000, 50_000] as const;

/**
 * Clients receive a bucket label, never a number. Exact distances from
 * three vantage points reconstruct the target's position by
 * trilateration — this is how Grindr was deanonymised twice.
 */
export function distanceBucket(metres: number): string {
  for (const edge of BUCKETS) {
    if (metres <= edge) {
      return `<${edge / 1000}km`;
    }
  }
  return '50km+';
}
