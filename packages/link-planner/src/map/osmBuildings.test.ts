import { describe, expect, it } from 'vitest';
import { osmBuildingHeight, parseOsmLengthMeters } from './osmBuildings';

describe('OSM building height parsing', () => {
  it('prefers explicit metric or imperial height values', () => {
    expect(osmBuildingHeight({ height: '18.5 m', 'building:levels': '3' })).toEqual({
      heightMeters: 18.5,
      source: 'osm-height',
    });
    expect(parseOsmLengthMeters('30 ft')).toBeCloseTo(9.144);
  });

  it('derives total height from facade and roof levels', () => {
    expect(osmBuildingHeight({ 'building:levels': '5', 'roof:levels': '1' })).toEqual({
      heightMeters: 18,
      source: 'osm-levels',
    });
  });

  it('labels type-based fallback values as estimates', () => {
    expect(osmBuildingHeight({ building: 'shed' })).toEqual({ heightMeters: 3, source: 'estimated' });
    expect(osmBuildingHeight({ building: 'yes' })).toEqual({ heightMeters: 6, source: 'estimated' });
  });
});
