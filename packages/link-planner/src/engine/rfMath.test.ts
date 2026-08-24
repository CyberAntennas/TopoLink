import { describe, expect, it } from 'vitest';
import { casablancaDemoWorkspace } from '../fixtures/casablancaDemoWorkspace';
import {
  analyzeTerrainProfile,
  assessPublicWifiInterference,
  calculateOptimalLinkAlignment,
  calculateLinkBudget,
  firstFresnelRadiusMeters,
  freeSpacePathLossDb,
  haversineDistanceMeters,
  initialBearingDegrees,
} from './rfMath';

describe('RF math', () => {
  it('calculates the distance between the Casablanca fixture sites', () => {
    const [siteA, siteB] = casablancaDemoWorkspace.sites;
    expect(siteA).toBeDefined();
    expect(siteB).toBeDefined();
    expect(haversineDistanceMeters(siteA!.location, siteB!.location)).toBeCloseTo(4_547, 0);
  });

  it('calculates the first Fresnel radius at path midpoint', () => {
    expect(firstFresnelRadiusMeters(5_800, 2_270.5, 2_270.5)).toBeCloseTo(7.66, 1);
  });

  it('rejects an invalid frequency', () => {
    expect(() => firstFresnelRadiusMeters(0, 100, 100)).toThrow('frequencyMHz must be positive');
  });

  it('calculates free-space loss and receive power', () => {
    expect(freeSpacePathLossDb(5_800, 4_547)).toBeCloseTo(120.87, 1);
    const result = calculateLinkBudget(casablancaDemoWorkspace.links[0]!.radio, 4_547);
    expect(result.receivedPowerDbm).toBeCloseTo(-47.87, 1);
    expect(result.maximumFreeSpaceRangeMeters).toBeGreaterThan(result.distanceMeters);
    expect(result.linkMarginDb).toBeCloseTo(27.13, 1);
    expect(result.maximumFresnelRadiusMeters).toBeCloseTo(7.67, 1);
  });

  it('analyzes terrain, earth curvature, and required Fresnel clearance', () => {
    const result = analyzeTerrainProfile({
      frequencyMHz: 5_800,
      clearanceRatio: 0.6,
      earthCurvatureKFactor: 4 / 3,
      startAntennaElevationMeters: 130,
      endAntennaElevationMeters: 130,
      distancesMeters: new Float32Array([0, 2_500, 5_000]),
      elevationsMeters: new Float32Array([100, 126, 100]),
    });
    expect(result.terrainElevationsMeters[1]).toBeGreaterThan(126);
    expect(result.minimumClearanceMeters).toBeLessThan(0);
    expect(result.clear).toBe(false);
    expect(result.worstPointDistanceMeters).toBe(2_500);
  });

  it('calculates reciprocal endpoint bearings and elevation tilt', () => {
    const [siteA, siteB] = casablancaDemoWorkspace.sites;
    const alignment = calculateOptimalLinkAlignment(
      siteA!.location,
      90,
      siteB!.location,
      105,
    );
    expect(initialBearingDegrees(siteA!.location, siteB!.location)).toBeCloseTo(alignment.siteAAzimuthDegrees, 6);
    expect(alignment.siteAAzimuthDegrees).toBeGreaterThanOrEqual(0);
    expect(alignment.siteAAzimuthDegrees).toBeLessThan(360);
    expect(alignment.siteBAzimuthDegrees).toBeGreaterThanOrEqual(0);
    expect(alignment.siteBAzimuthDegrees).toBeLessThan(360);
    expect(alignment.siteATiltDegrees).toBeCloseTo(0.189, 2);
    expect(alignment.siteBTiltDegrees).toBeCloseTo(-alignment.siteATiltDegrees, 6);
  });

  it('recommends the least observed public Wi-Fi band near both endpoints', () => {
    const [siteA, siteB] = casablancaDemoWorkspace.sites;
    const assessment = assessPublicWifiInterference(siteA!.location, siteB!.location, [
      { id: 'wifi-a', latitude: siteA!.location.latitude, longitude: siteA!.location.longitude, frequencyMHz: 2_437 },
      { id: 'wifi-b', latitude: siteB!.location.latitude, longitude: siteB!.location.longitude, frequencyMHz: 5_800 },
    ]);
    expect(assessment.nearbyHotspotCount).toBe(2);
    expect(assessment.recommendedBandMHz).toBe(6_000);
    expect(assessment.risk).toBe('low');
  });
});
