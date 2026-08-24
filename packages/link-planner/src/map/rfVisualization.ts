import type { CyberAntennaProduct } from '../products/cyberAntennasCatalog';

const SPEED_OF_LIGHT_METERS_PER_SECOND = 299_792_458;

export interface AntennaBeamPattern {
  azimuthDegrees: number;
  elevationDegrees: number;
  referenceDb: 3 | 6;
  source: 'manufacturer' | 'aperture-estimate' | 'form-factor-estimate';
}

export function rfFrequencyColorHex(frequencyMHz: number): number {
  if (frequencyMHz < 3_000) return 0xef5b5b;
  if (frequencyMHz < 4_000) return 0xe9a53b;
  if (frequencyMHz < 5_000) return 0x55d45a;
  if (frequencyMHz < 5_925) return 0x48d8cf;
  if (frequencyMHz < 6_500) return 0x438de2;
  if (frequencyMHz < 10_000) return 0x9654db;
  return 0xc43d85;
}

export function antennaBeamPattern(product: CyberAntennaProduct, frequencyMHz: number): AntennaBeamPattern {
  if (!Number.isFinite(frequencyMHz) || frequencyMHz <= 0) throw new RangeError('frequencyMHz must be positive');
  if (product.formFactor === 'dish' && product.diameterMeters) {
    const wavelengthMeters = SPEED_OF_LIGHT_METERS_PER_SECOND / (frequencyMHz * 1_000_000);
    const width = Math.max(1, Math.min(120, (70 * wavelengthMeters) / product.diameterMeters));
    return { azimuthDegrees: width, elevationDegrees: width, referenceDb: 3, source: 'aperture-estimate' };
  }
  const namedBeamwidth = product.id.match(/(?:^|[-_])(?:S|A)(20|30|60)(?:$|[-_])/)?.[1];
  if (namedBeamwidth) {
    const azimuthDegrees = Number(namedBeamwidth);
    const asymmetrical = product.id.includes('A20') || product.id.includes('A60');
    return {
      azimuthDegrees,
      elevationDegrees: asymmetrical ? azimuthDegrees / 2 : azimuthDegrees,
      referenceDb: 3,
      source: asymmetrical ? 'form-factor-estimate' : 'manufacturer',
    };
  }
  if (product.formFactor === 'horn') return { azimuthDegrees: 30, elevationDegrees: 30, referenceDb: 3, source: 'form-factor-estimate' };
  if (product.formFactor === 'panel') return { azimuthDegrees: 60, elevationDegrees: 30, referenceDb: 3, source: 'form-factor-estimate' };
  return { azimuthDegrees: 90, elevationDegrees: 90, referenceDb: 3, source: 'form-factor-estimate' };
}

export function antennaBeamwidthDegrees(product: CyberAntennaProduct, frequencyMHz: number): number {
  return antennaBeamPattern(product, frequencyMHz).azimuthDegrees;
}
