/**
 * Distance between two points on the earth, in kilometres.
 *
 * Haversine, which assumes a sphere. The error against a proper ellipsoid model is a few tenths of a
 * percent, and this is used to answer "which beaches are near this one", where being out by 20 metres
 * over 8 km changes nothing.
 */
export function distanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Coarse enough to be honest: below 10 km one decimal, above it whole kilometres. */
export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
