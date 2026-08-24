import type { MultiPolygon, Polygon } from 'geojson';
import type { LinkPlannerWorkspace, Site } from '../domain/types';
import { firstFresnelRadiusMeters } from '../engine/rfMath';

export type BuildingHeightSource = 'osm-height' | 'osm-levels' | 'basemap-height' | 'estimated';

export interface BuildingFootprintCandidate {
  id: string;
  name?: string;
  heightMeters: number;
  heightSource?: BuildingHeightSource;
  geometry: Polygon | MultiPolygon;
}

export interface BuildingLinkObstacle {
  id: string;
  buildingId: string;
  linkId: string;
  name: string;
  latitude: number;
  longitude: number;
  heightMeters: number;
  heightSource: BuildingHeightSource;
  geometry: Polygon | MultiPolygon;
  distanceFromSiteAMeters: number;
  groundElevationMeters: number;
  pathElevationMeters: number;
  roofElevationMeters: number;
  verticalClearanceMeters: number;
  requiredFresnelRadiusMeters: number;
  fresnelClearanceMeters: number;
  estimatedDiffractionLossDb: number;
}

export interface BuildingObstacleOptions {
  terrainElevationAt?: (longitude: number, latitude: number) => number | undefined;
  includeClearBuildings?: boolean;
}

function antennaElevation(site: Site): number {
  return site.location.elevationMeters +
    (site.mounting?.surface === 'rooftop' ? site.mounting.buildingHeightMeters : 0) +
    site.antennaHeightMeters + 0.9;
}

function segmentIntersectionFraction(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): number | undefined {
  const r = [b[0] - a[0], b[1] - a[1]] as const;
  const s = [d[0] - c[0], d[1] - c[1]] as const;
  const denominator = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denominator) < 1e-12) return undefined;
  const offset = [c[0] - a[0], c[1] - a[1]] as const;
  const t = (offset[0] * s[1] - offset[1] * s[0]) / denominator;
  const u = (offset[0] * r[1] - offset[1] * r[0]) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : undefined;
}

function crossingRange(
  start: [number, number],
  end: [number, number],
  ring: number[][],
): [number, number] | undefined {
  const crossings: number[] = [];
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index];
    const b = ring[index + 1];
    if (!a || !b) continue;
    const fraction = segmentIntersectionFraction(start, end, [a[0]!, a[1]!], [b[0]!, b[1]!]);
    if (fraction !== undefined && !crossings.some((value) => Math.abs(value - fraction) < 1e-7)) crossings.push(fraction);
  }
  crossings.sort((a, b) => a - b);
  return crossings.length >= 2 ? [crossings[0]!, crossings[crossings.length - 1]!] : undefined;
}

function approximateDistanceMeters(a: Site['location'], b: Site['location']): number {
  const meanLatitude = ((a.latitude + b.latitude) / 2) * Math.PI / 180;
  const x = (b.longitude - a.longitude) * 111_320 * Math.cos(meanLatitude);
  const y = (b.latitude - a.latitude) * 110_540;
  return Math.hypot(x, y);
}

export function findBuildingLinkObstacles(
  workspace: LinkPlannerWorkspace,
  buildings: readonly BuildingFootprintCandidate[],
  options: BuildingObstacleOptions = {},
): BuildingLinkObstacle[] {
  const sites = new Map(workspace.sites.map((site) => [site.id, site]));
  const obstacles: BuildingLinkObstacle[] = [];
  for (const link of workspace.links) {
    const siteA = sites.get(link.siteAId);
    const siteB = sites.get(link.siteBId);
    if (!siteA || !siteB) continue;
    const start: [number, number] = [siteA.location.longitude, siteA.location.latitude];
    const end: [number, number] = [siteB.location.longitude, siteB.location.latitude];
    const linkDistance = approximateDistanceMeters(siteA.location, siteB.location);
    for (const building of buildings) {
      const polygons = building.geometry.type === 'Polygon' ? [building.geometry.coordinates] : building.geometry.coordinates;
      const ranges = polygons
        .map((polygon) => crossingRange(start, end, polygon[0] ?? []))
        .filter((range): range is [number, number] => Boolean(range));
      if (!ranges.length) continue;
      const range = ranges.reduce((widest, candidate) =>
        candidate[1] - candidate[0] > widest[1] - widest[0] ? candidate : widest,
      );
      const sampleFractions = [range[0], (range[0] + range[1]) / 2, range[1]];
      let worst: {
        fraction: number;
        groundElevation: number;
        pathElevation: number;
        roofElevation: number;
        verticalClearance: number;
        requiredFresnelRadius: number;
        fresnelClearance: number;
      } | undefined;
      for (const fraction of sampleFractions) {
        const longitude = start[0] + (end[0] - start[0]) * fraction;
        const latitude = start[1] + (end[1] - start[1]) * fraction;
        const interpolatedGroundElevation = siteA.location.elevationMeters +
          (siteB.location.elevationMeters - siteA.location.elevationMeters) * fraction;
        const groundElevation = options.terrainElevationAt?.(longitude, latitude) ?? interpolatedGroundElevation;
        const pathElevation = antennaElevation(siteA) +
          (antennaElevation(siteB) - antennaElevation(siteA)) * fraction;
        const roofElevation = groundElevation + building.heightMeters;
        const verticalClearance = pathElevation - roofElevation;
        const distanceFromA = Math.max(0.01, linkDistance * fraction);
        const distanceFromB = Math.max(0.01, linkDistance * (1 - fraction));
        const requiredFresnelRadius = firstFresnelRadiusMeters(
          link.radio.frequencyMHz,
          distanceFromA,
          distanceFromB,
        ) * workspace.settings.fresnelClearanceRatio;
        const fresnelClearance = verticalClearance - requiredFresnelRadius;
        if (!worst || fresnelClearance < worst.fresnelClearance) {
          worst = { fraction, groundElevation, pathElevation, roofElevation, verticalClearance, requiredFresnelRadius, fresnelClearance };
        }
      }
      if (!worst || (!options.includeClearBuildings && worst.fresnelClearance >= 0)) continue;
      const fraction = worst.fraction;
      const longitude = start[0] + (end[0] - start[0]) * fraction;
      const latitude = start[1] + (end[1] - start[1]) * fraction;
      const distanceFromA = Math.max(1, linkDistance * fraction);
      const distanceFromB = Math.max(1, linkDistance * (1 - fraction));
      const wavelengthMeters = 299_792_458 / (link.radio.frequencyMHz * 1_000_000);
      const diffractionParameter = (worst.roofElevation - worst.pathElevation) *
        Math.sqrt((2 * (distanceFromA + distanceFromB)) / (wavelengthMeters * distanceFromA * distanceFromB));
      const estimatedDiffractionLossDb = diffractionParameter <= -0.78
        ? 0
        : 6.9 + 20 * Math.log10(
            Math.sqrt((diffractionParameter - 0.1) ** 2 + 1) + diffractionParameter - 0.1,
          );
      obstacles.push({
        id: `${link.id}:${building.id}`,
        buildingId: building.id,
        linkId: link.id,
        name: building.name ?? 'OSM building',
        latitude,
        longitude,
        heightMeters: building.heightMeters,
        heightSource: building.heightSource ?? 'estimated',
        geometry: building.geometry,
        distanceFromSiteAMeters: linkDistance * fraction,
        groundElevationMeters: worst.groundElevation,
        pathElevationMeters: worst.pathElevation,
        roofElevationMeters: worst.roofElevation,
        verticalClearanceMeters: worst.verticalClearance,
        requiredFresnelRadiusMeters: worst.requiredFresnelRadius,
        fresnelClearanceMeters: worst.fresnelClearance,
        estimatedDiffractionLossDb: Math.min(40, Math.max(0, estimatedDiffractionLossDb)),
      });
    }
  }
  return obstacles;
}
