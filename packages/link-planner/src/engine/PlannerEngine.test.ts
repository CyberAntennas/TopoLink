import { describe, expect, it } from 'vitest';
import { casablancaDemoWorkspace } from '../fixtures/casablancaDemoWorkspace';
import { createPlannerEngine } from './PlannerEngine';

describe('PlannerEngine', () => {
  it('calculates link budget and terrain profile through its JavaScript boundary', async () => {
    const engine = createPlannerEngine();
    const budget = await engine.linkBudget(casablancaDemoWorkspace.links[0]!.radio, 4_547);
    expect(budget.freeSpacePathLossDb).toBeCloseTo(120.87, 1);

    const profile = await engine.terrainProfile({
      frequencyMHz: 5_800,
      clearanceRatio: 0.6,
      earthCurvatureKFactor: 4 / 3,
      startAntennaElevationMeters: 100,
      endAntennaElevationMeters: 100,
      distancesMeters: new Float32Array([0, 500, 1_000]),
      elevationsMeters: new Float32Array([50, 55, 50]),
    });
    expect(profile.clear).toBe(true);
    expect(profile.clearanceMeters).toBeInstanceOf(Float32Array);
    expect(profile.clearanceMeters).toHaveLength(3);
    engine.destroy();
  });
});
