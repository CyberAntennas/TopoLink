import { describe, expect, it } from 'vitest';
import { createOneMeterRoofGrid, snapToOneMeterRoofGrid } from './roofGrid';

describe('one meter rooftop grid', () => {
  const footprint = [
    [11, 43] as [number, number],
    [11.00007, 43] as [number, number],
    [11.00007, 43.00005] as [number, number],
    [11, 43.00005] as [number, number],
    [11, 43] as [number, number],
  ];

  it('clips meter-spaced grid segments to a roof footprint', () => {
    const grid = createOneMeterRoofGrid(footprint);
    expect(grid?.segments.length).toBeGreaterThan(8);
    expect(grid?.segments.length).toBeLessThan(30);
  });

  it('snaps a rooftop placement to whole local meters', () => {
    const snapped = snapToOneMeterRoofGrid(11.000031, 43.000021, footprint);
    const second = snapToOneMeterRoofGrid(snapped[0], snapped[1], footprint);
    expect(second).toEqual(snapped);
  });
});
