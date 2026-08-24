import { describe, expect, it } from 'vitest';
import { CYBER_ANTENNAS_PRODUCTS } from './cyberAntennasCatalog';

describe('Cyber Antennas catalog', () => {
  it('contains every official shop product with a packaged image', () => {
    expect(CYBER_ANTENNAS_PRODUCTS).toHaveLength(24);
    expect(new Set(CYBER_ANTENNAS_PRODUCTS.map((product) => product.id)).size).toBe(24);
    for (const product of CYBER_ANTENNAS_PRODUCTS) {
      expect(product.imageUrl).toBeTruthy();
      expect(product.officialImageUrl).toMatch(/^https:\/\//);
      expect(product.productUrl).toBe(`https://cyberantennas.com/products/${product.id}`);
    }
  });
});
