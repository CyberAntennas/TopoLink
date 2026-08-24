import type { GeoPoint, RadioConfiguration } from '../domain/types';

const EARTH_RADIUS_METERS = 6_371_008.8;
const SPEED_OF_LIGHT_METERS_PER_SECOND = 299_792_458;

export interface LinkBudgetResult {
  distanceMeters: number;
  freeSpacePathLossDb: number;
  receivedPowerDbm: number;
  maximumFresnelRadiusMeters: number;
  maximumFreeSpaceRangeMeters: number;
  linkMarginDb: number;
}

export interface OptimalLinkAlignment {
  distanceMeters: number;
  siteAAzimuthDegrees: number;
  siteBAzimuthDegrees: number;
  siteATiltDegrees: number;
  siteBTiltDegrees: number;
}

export interface PublicWifiObservation {
  id: string;
  latitude: number;
  longitude: number;
  frequencyMHz?: number;
  name?: string;
}

export interface WifiInterferenceAssessment {
  nearbyHotspotCount: number;
  weightedInterferenceScore: number;
  risk: 'low' | 'moderate' | 'high';
  recommendedBandMHz: 2_400 | 5_800 | 6_000;
}

export interface TerrainProfileInput {
  frequencyMHz: number;
  clearanceRatio: number;
  earthCurvatureKFactor: number;
  startAntennaElevationMeters: number;
  endAntennaElevationMeters: number;
  distancesMeters: Float32Array;
  elevationsMeters: Float32Array;
}

export interface TerrainProfileResult {
  clear: boolean;
  minimumClearanceMeters: number;
  worstPointDistanceMeters: number;
  distancesMeters: Float32Array;
  terrainElevationsMeters: Float32Array;
  lineOfSightElevationsMeters: Float32Array;
  fresnelRadiiMeters: Float32Array;
  clearanceMeters: Float32Array;
}

export function haversineDistanceMeters(pointA: GeoPoint, pointB: GeoPoint): number {
  const latitudeDelta = degreesToRadians(pointB.latitude - pointA.latitude);
  const longitudeDelta = degreesToRadians(pointB.longitude - pointA.longitude);
  const latitudeA = degreesToRadians(pointA.latitude);
  const latitudeB = degreesToRadians(pointB.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

export function initialBearingDegrees(pointA: GeoPoint, pointB: GeoPoint): number {
  const latitudeA = degreesToRadians(pointA.latitude);
  const latitudeB = degreesToRadians(pointB.latitude);
  const longitudeDelta = degreesToRadians(pointB.longitude - pointA.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(latitudeB);
  const x =
    Math.cos(latitudeA) * Math.sin(latitudeB) -
    Math.sin(latitudeA) * Math.cos(latitudeB) * Math.cos(longitudeDelta);
  return normalizeDegrees(radiansToDegrees(Math.atan2(y, x)));
}

export function calculateOptimalLinkAlignment(
  pointA: GeoPoint,
  antennaElevationAMeters: number,
  pointB: GeoPoint,
  antennaElevationBMeters: number,
): OptimalLinkAlignment {
  const distanceMeters = haversineDistanceMeters(pointA, pointB);
  if (distanceMeters <= 0) throw new RangeError('link endpoints must be different');
  const elevationAngleDegrees = radiansToDegrees(
    Math.atan2(antennaElevationBMeters - antennaElevationAMeters, distanceMeters),
  );
  return {
    distanceMeters,
    siteAAzimuthDegrees: initialBearingDegrees(pointA, pointB),
    siteBAzimuthDegrees: initialBearingDegrees(pointB, pointA),
    siteATiltDegrees: elevationAngleDegrees,
    siteBTiltDegrees: -elevationAngleDegrees,
  };
}

export function assessPublicWifiInterference(
  pointA: GeoPoint,
  pointB: GeoPoint,
  observations: readonly PublicWifiObservation[],
): WifiInterferenceAssessment {
  const bands = [2_400, 5_800, 6_000] as const;
  const scores = new Map<(typeof bands)[number], number>(bands.map((band) => [band, 0]));
  let nearbyHotspotCount = 0;
  for (const observation of observations) {
    const observationPoint: GeoPoint = {
      latitude: observation.latitude,
      longitude: observation.longitude,
      elevationMeters: 0,
    };
    const distance = Math.min(
      haversineDistanceMeters(pointA, observationPoint),
      haversineDistanceMeters(pointB, observationPoint),
    );
    if (distance > 1_000) continue;
    nearbyHotspotCount += 1;
    const proximityWeight = Math.max(0.05, 1 - distance / 1_000);
    for (const band of bands) {
      const observedBand = observation.frequencyMHz === undefined
        ? undefined
        : observation.frequencyMHz < 3_000
          ? 2_400
          : observation.frequencyMHz < 5_925
            ? 5_800
            : 6_000;
      const frequencyWeight = observedBand === undefined ? 0.45 : observedBand === band ? 1 : 0.08;
      scores.set(band, scores.get(band)! + proximityWeight * frequencyWeight);
    }
  }
  const weightedInterferenceScore = Math.min(...scores.values());
  const recommendedBandMHz = bands.reduce((best, band) =>
    scores.get(band)! < scores.get(best)! ? band : best,
  );
  return {
    nearbyHotspotCount,
    weightedInterferenceScore,
    risk: weightedInterferenceScore >= 5 ? 'high' : weightedInterferenceScore >= 1.5 ? 'moderate' : 'low',
    recommendedBandMHz,
  };
}

export function firstFresnelRadiusMeters(
  frequencyMHz: number,
  distanceFromAMeters: number,
  distanceFromBMeters: number,
): number {
  if (frequencyMHz <= 0) {
    throw new RangeError('frequencyMHz must be positive');
  }
  if (distanceFromAMeters < 0 || distanceFromBMeters < 0) {
    throw new RangeError('path distances cannot be negative');
  }
  const totalDistance = distanceFromAMeters + distanceFromBMeters;
  if (totalDistance === 0) return 0;

  const wavelength = SPEED_OF_LIGHT_METERS_PER_SECOND / (frequencyMHz * 1_000_000);
  return Math.sqrt((wavelength * distanceFromAMeters * distanceFromBMeters) / totalDistance);
}

export function freeSpacePathLossDb(frequencyMHz: number, distanceMeters: number): number {
  if (frequencyMHz <= 0) throw new RangeError('frequencyMHz must be positive');
  if (distanceMeters <= 0) throw new RangeError('distanceMeters must be positive');
  return 32.44 + 20 * Math.log10(frequencyMHz) + 20 * Math.log10(distanceMeters / 1_000);
}

export function calculateLinkBudget(
  radio: RadioConfiguration,
  distanceMeters: number,
): LinkBudgetResult {
  const pathLoss = freeSpacePathLossDb(radio.frequencyMHz, distanceMeters);
  const receivedPowerDbm = radio.transmitPowerDbm + radio.antennaGainDbi * 2 - radio.systemLossDb - pathLoss;
  const receiverSensitivityDbm = radio.receiverSensitivityDbm ?? -75;
  return {
    distanceMeters,
    freeSpacePathLossDb: pathLoss,
    receivedPowerDbm,
    maximumFreeSpaceRangeMeters: maximumFreeSpaceRangeMeters(radio),
    linkMarginDb: receivedPowerDbm - receiverSensitivityDbm,
    maximumFresnelRadiusMeters: firstFresnelRadiusMeters(
      radio.frequencyMHz,
      distanceMeters / 2,
      distanceMeters / 2,
    ),
  };
}

export function maximumFreeSpaceRangeMeters(radio: RadioConfiguration): number {
  if (radio.frequencyMHz <= 0) throw new RangeError('frequencyMHz must be positive');
  const receiverSensitivityDbm = radio.receiverSensitivityDbm ?? -75;
  if (receiverSensitivityDbm >= 0) throw new RangeError('receiverSensitivityDbm must be negative');
  const maximumPathLossDb =
    radio.transmitPowerDbm + radio.antennaGainDbi * 2 - radio.systemLossDb - receiverSensitivityDbm;
  const distanceKilometers = 10 ** ((maximumPathLossDb - 32.44 - 20 * Math.log10(radio.frequencyMHz)) / 20);
  return distanceKilometers * 1_000;
}

export function analyzeTerrainProfile(input: TerrainProfileInput): TerrainProfileResult {
  const { distancesMeters, elevationsMeters } = input;
  if (distancesMeters.length !== elevationsMeters.length || distancesMeters.length < 2) {
    throw new RangeError('terrain profile arrays must have equal lengths of at least two');
  }
  if (input.earthCurvatureKFactor <= 0) throw new RangeError('earthCurvatureKFactor must be positive');
  if (input.clearanceRatio < 0 || input.clearanceRatio > 1) {
    throw new RangeError('clearanceRatio must be between zero and one');
  }

  const totalDistance = distancesMeters[distancesMeters.length - 1]!;
  if (totalDistance <= 0) throw new RangeError('terrain profile distance must be positive');
  const effectiveEarthRadius = EARTH_RADIUS_METERS * input.earthCurvatureKFactor;
  const terrain = new Float32Array(distancesMeters.length);
  const lineOfSight = new Float32Array(distancesMeters.length);
  const fresnel = new Float32Array(distancesMeters.length);
  const clearance = new Float32Array(distancesMeters.length);
  let minimumClearanceMeters = Number.POSITIVE_INFINITY;
  let worstPointDistanceMeters = 0;

  for (let index = 0; index < distancesMeters.length; index += 1) {
    const distanceFromA = distancesMeters[index]!;
    if (index > 0 && distanceFromA < distancesMeters[index - 1]!) {
      throw new RangeError('terrain profile distances must be ordered');
    }
    const distanceFromB = totalDistance - distanceFromA;
    const fraction = distanceFromA / totalDistance;
    const curvatureBulge = (distanceFromA * distanceFromB) / (2 * effectiveEarthRadius);
    terrain[index] = elevationsMeters[index]! + curvatureBulge;
    lineOfSight[index] =
      input.startAntennaElevationMeters +
      (input.endAntennaElevationMeters - input.startAntennaElevationMeters) * fraction;
    fresnel[index] = firstFresnelRadiusMeters(input.frequencyMHz, distanceFromA, distanceFromB);
    clearance[index] = lineOfSight[index]! - terrain[index]! - fresnel[index]! * input.clearanceRatio;
    if (clearance[index]! < minimumClearanceMeters) {
      minimumClearanceMeters = clearance[index]!;
      worstPointDistanceMeters = distanceFromA;
    }
  }

  return {
    clear: minimumClearanceMeters >= 0,
    minimumClearanceMeters,
    worstPointDistanceMeters,
    distancesMeters: new Float32Array(distancesMeters),
    terrainElevationsMeters: terrain,
    lineOfSightElevationsMeters: lineOfSight,
    fresnelRadiiMeters: fresnel,
    clearanceMeters: clearance,
  };
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function normalizeDegrees(value: number): number {
  return (value + 360) % 360;
}
