import { describe, expect, it } from 'vitest';
import { casablancaDemoWorkspace } from '../fixtures/casablancaDemoWorkspace';
import { findBuildingLinkObstacles } from './buildingObstacles';

describe('building link obstacles', () => {
  it('finds a path crossing and calculates its clearance effect', () => {
    const a = casablancaDemoWorkspace.sites[0]!.location;
    const b = casablancaDemoWorkspace.sites[1]!.location;
    const midpoint = { latitude: (a.latitude + b.latitude) / 2, longitude: (a.longitude + b.longitude) / 2 };
    const obstacle = findBuildingLinkObstacles(casablancaDemoWorkspace, [{
      id: 'building-1',
      name: 'Path building',
      heightMeters: 100,
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [midpoint.longitude - 0.0002, midpoint.latitude - 0.0002],
          [midpoint.longitude + 0.0002, midpoint.latitude - 0.0002],
          [midpoint.longitude + 0.0002, midpoint.latitude + 0.0002],
          [midpoint.longitude - 0.0002, midpoint.latitude + 0.0002],
          [midpoint.longitude - 0.0002, midpoint.latitude - 0.0002],
        ]],
      },
    }]);
    expect(obstacle).toHaveLength(1);
    expect(obstacle[0]).toMatchObject({ name: 'Path building', heightMeters: 100 });
    expect(obstacle[0]!.verticalClearanceMeters).toBeLessThan(0);
    expect(obstacle[0]!.fresnelClearanceMeters).toBeLessThan(obstacle[0]!.verticalClearanceMeters);
    expect(obstacle[0]!.estimatedDiffractionLossDb).toBeGreaterThan(6);
  });

  it('uses terrain at the footprint and omits buildings that clear the required Fresnel zone', () => {
    const a = casablancaDemoWorkspace.sites[0]!.location;
    const b = casablancaDemoWorkspace.sites[1]!.location;
    const midpoint = { latitude: (a.latitude + b.latitude) / 2, longitude: (a.longitude + b.longitude) / 2 };
    const geometry = {
      type: 'Polygon' as const,
      coordinates: [[
        [midpoint.longitude - 0.0002, midpoint.latitude - 0.0002],
        [midpoint.longitude + 0.0002, midpoint.latitude - 0.0002],
        [midpoint.longitude + 0.0002, midpoint.latitude + 0.0002],
        [midpoint.longitude - 0.0002, midpoint.latitude + 0.0002],
        [midpoint.longitude - 0.0002, midpoint.latitude - 0.0002],
      ]],
    };
    expect(findBuildingLinkObstacles(casablancaDemoWorkspace, [{ id: 'low', heightMeters: 2, geometry }])).toHaveLength(0);
    const elevated = findBuildingLinkObstacles(
      casablancaDemoWorkspace,
      [{ id: 'terrain-building', heightMeters: 20, heightSource: 'osm-levels', geometry }],
      { terrainElevationAt: () => 130 },
    );
    expect(elevated).toHaveLength(1);
    expect(elevated[0]).toMatchObject({ groundElevationMeters: 130, heightSource: 'osm-levels' });
  });
});
