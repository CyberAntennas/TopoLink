import { describe, expect, it } from 'vitest';
import { getCyberAntennaProduct } from '../products/cyberAntennasCatalog';
import { antennaBeamPattern, antennaBeamwidthDegrees, rfFrequencyColorHex } from './rfVisualization';

describe('RF visualization', () => {
  it('maps operational frequency ranges to stable legend colors', () => {
    expect(rfFrequencyColorHex(2_400)).toBe(0xef5b5b);
    expect(rfFrequencyColorHex(3_500)).toBe(0xe9a53b);
    expect(rfFrequencyColorHex(4_500)).toBe(0x55d45a);
    expect(rfFrequencyColorHex(5_800)).toBe(0x48d8cf);
    expect(rfFrequencyColorHex(6_000)).toBe(0x438de2);
    expect(rfFrequencyColorHex(7_100)).toBe(0x9654db);
  });

  it('uses named horn width and frequency-dependent dish aperture width', () => {
    expect(antennaBeamwidthDegrees(getCyberAntennaProduct('A20'), 5_800)).toBe(20);
    expect(antennaBeamPattern(getCyberAntennaProduct('A20'), 5_800)).toMatchObject({
      azimuthDegrees: 20,
      elevationDegrees: 10,
      referenceDb: 3,
    });
    const narrow = antennaBeamwidthDegrees(getCyberAntennaProduct('09M-DISH-HP'), 5_800);
    const wide = antennaBeamwidthDegrees(getCyberAntennaProduct('09M-DISH-HP'), 2_400);
    expect(narrow).toBeLessThan(wide);
    expect(narrow).toBeGreaterThan(1);
  });
});
