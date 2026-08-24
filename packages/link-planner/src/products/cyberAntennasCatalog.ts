import dish06Image from './assets/06M-DISH-HP.png?url&no-inline';
import dish06MimosaImage from './assets/06M-DISH-MIMOSA-B6X-2PK.webp?url&no-inline';
import dish09Image from './assets/09M-DISH-HP.png?url&no-inline';
import dish09MimosaImage from './assets/09M-DISH-MIMOSA-B6X-2PK.webp?url&no-inline';
import dish09RpsmaImage from './assets/09M-DISH-RPSMA-2PK.webp?url&no-inline';
import dish12Image from './assets/12M-DISH-HP.png?url&no-inline';
import dish12MimosaImage from './assets/12M-DISH-MIMOSA-B6X-2PK.webp?url&no-inline';
import dish12RpsmaImage from './assets/12M-DISH-RPSMA-2PK.webp?url&no-inline';
import dish18SixGhzImage from './assets/18M-DISH-6GHZ.png?url&no-inline';
import dish18Image from './assets/18M-DISH-HP.png?url&no-inline';
import dish18MimosaImage from './assets/18M-DISH-MIMOSA-B6X-2PK.webp?url&no-inline';
import dish18RpsmaImage from './assets/18M-DISH-RPSMA-2PK.webp?url&no-inline';
import fwaImage from './assets/5G-FWA-CPE.jpg?url&no-inline';
import a20Image from './assets/A20.png?url&no-inline';
import a60Image from './assets/A60.png?url&no-inline';
import diplexerImage from './assets/Diplexer-mszhz72d.png?url&no-inline';
import doubleA20Image from './assets/DOUBLE-A20.png?url&no-inline';
import doubleA60Image from './assets/DOUBLE-A60.png?url&no-inline';
import quadplexerImage from './assets/Quadplexer.webp?url&no-inline';
import s30Image from './assets/S30.webp?url&no-inline';
import t1Image from './assets/T1-SECTOR.jpg?url&no-inline';
import t2Image from './assets/T2-RELAY.jpg?url&no-inline';
import t3FiveImage from './assets/T3-HORN5.png?url&no-inline';
import t3SixImage from './assets/T3-HORN6.webp?url&no-inline';

export type DeviceFormFactor = 'dish' | 'horn' | 'panel' | 'accessory';

export interface CyberAntennaProduct {
  id: string;
  name: string;
  category: 'Dish' | 'Horn' | 'Mesh' | 'CPE' | 'Accessory';
  formFactor: DeviceFormFactor;
  imageUrl: string;
  officialImageUrl: string;
  productUrl: string;
  diameterMeters?: number;
}

const product = (
  id: string,
  name: string,
  category: CyberAntennaProduct['category'],
  formFactor: DeviceFormFactor,
  imageUrl: string,
  officialImageUrl: string,
  diameterMeters?: number,
): CyberAntennaProduct => ({
  id,
  name,
  category,
  formFactor,
  imageUrl,
  officialImageUrl,
  productUrl: `https://cyberantennas.com/products/${id}`,
  ...(diameterMeters === undefined ? {} : { diameterMeters }),
});

export const CYBER_ANTENNAS_PRODUCTS: readonly CyberAntennaProduct[] = [
  product('18M-DISH-6GHZ', '1.8 m Microwave Dish 6 GHz', 'Dish', 'dish', dish18SixGhzImage, 'https://cyberantennas.s3.us-east-1.amazonaws.com/cyber-antennas/products/1778984386844-qujv9sml-product_69fd46b103a9c010f5eb650a_1778984386154.webp', 1.8),
  product('S30', '30° Symmetrical Horn', 'Horn', 'horn', s30Image, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas-llc/products/1765340972795-z69tn2gn-CY-S30-004.webp'),
  product('A20', '20° Asymmetrical Horn', 'Horn', 'horn', a20Image, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas/products/1767480154895-eg7kx3m2-CY-20-001.webp'),
  product('A60', '60° Asymmetrical Horn', 'Horn', 'horn', a60Image, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas-llc/products/1767223918200-b1ojgu5m-003.webp'),
  product('DOUBLE-A20', 'Double 20° Asymmetrical Horn 4x4', 'Horn', 'horn', doubleA20Image, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas-llc/products/1766618419364-bta0xe4n-CY-Dual-A20-001.webp'),
  product('DOUBLE-A60', 'Double Asymmetrical 60° Horn 4x4', 'Horn', 'horn', doubleA60Image, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas-llc/products/1766554836490-1hyh7g80-CY-Dual-A60-005.webp'),
  product('18M-DISH-HP', '1.8m Dish High Performance', 'Dish', 'dish', dish18Image, 'https://cyberantennas.s3.us-east-1.amazonaws.com/cyber-antennas/products/1776917203083-8d1bq02r-product_69e31b21541a7c66f7e6be61_1776917202072.webp', 1.8),
  product('09M-DISH-HP', '0.9m Dish High Performance', 'Dish', 'dish', dish09Image, 'https://cyberantennas.s3.us-east-1.amazonaws.com/cyber-antennas/products/1776564631293-cdx7od9d-09M-DISH-HP.webp', 0.9),
  product('12M-DISH-HP', '1.2m Dish High Performance', 'Dish', 'dish', dish12Image, 'https://cyberantennas.s3.us-east-1.amazonaws.com/cyber-antennas/products/1776591006784-f04jfiw3-12M-DISH-HP.webp', 1.2),
  product('06M-DISH-HP', '0.6m Dish High Performance', 'Dish', 'dish', dish06Image, 'https://isohorns.s3.us-east-1.amazonaws.com/products/1756340883089-ibdstpyc-600mm_Dish-001_.webp', 0.6),
  product('Quadplexer', 'Quadplexer', 'Accessory', 'accessory', quadplexerImage, 'https://isohorns.s3.us-east-1.amazonaws.com/products/1755009549598-hvyxg5fg-10.webp'),
  product('5G-FWA-CPE', '5G FWA CPE', 'CPE', 'panel', fwaImage, 'https://isohorns.s3.us-east-1.amazonaws.com/products/1751239046977-sth5o047-006_copy.webp'),
  product('T1-SECTOR', 'T1 Sector', 'Mesh', 'panel', t1Image, 'https://isohorns.s3.us-east-1.amazonaws.com/products/1750288505567-fkc145lv-0001_copy.webp'),
  product('T2-RELAY', 'T2 Relay', 'Mesh', 'panel', t2Image, 'https://isohorns.s3.us-east-1.amazonaws.com/products/1749096762702-8f7tvpnv-WhatsApp_Image_2025-06-03_at_10.48.31.jpeg'),
  product('T3-HORN5', 'T3 Horn 5', 'Mesh', 'horn', t3FiveImage, 'https://isohorns.s3.us-east-1.amazonaws.com/products/1743107053134-f8hm5vdz-t3-horn-1.png'),
  product('T3-HORN6', 'T3 Horn 6', 'Mesh', 'horn', t3SixImage, 'https://isohorns.s3.us-east-1.amazonaws.com/products/1743116491462-ub40ea7r-t3-horn-1.webp'),
  product('06M-DISH-MIMOSA-B6X-2PK', '0.6m Dish Mimosa B6x Twist-on 2-pack', 'Dish', 'dish', dish06MimosaImage, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas/products/1769018410262-h28ydkqk-CY-600-Mimosa.webp', 0.6),
  product('09M-DISH-MIMOSA-B6X-2PK', '0.9m Dish Mimosa B6x Twist-on 2-pack', 'Dish', 'dish', dish09MimosaImage, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas/products/1769022225952-kv81aea2-CY-900-Mimosa-01.webp', 0.9),
  product('09M-DISH-RPSMA-2PK', '0.9m Dish RP-SMA 2-pack', 'Dish', 'dish', dish09RpsmaImage, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas/products/1769022225952-kv81aea2-CY-900-Mimosa-01.webp', 0.9),
  product('12M-DISH-RPSMA-2PK', '1.2m Dish RP-SMA 2-pack', 'Dish', 'dish', dish12RpsmaImage, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas/products/1768876522041-ctwjlcvx-CY-1200-Mimosa-01.webp', 1.2),
  product('12M-DISH-MIMOSA-B6X-2PK', '1.2m Dish Mimosa B6x Twist-on 2-pack', 'Dish', 'dish', dish12MimosaImage, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas/products/1768876522041-ctwjlcvx-CY-1200-Mimosa-01.webp', 1.2),
  product('18M-DISH-RPSMA-2PK', '1.8m Dish RP-SMA 2-pack', 'Dish', 'dish', dish18RpsmaImage, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas/products/1769014685167-o8hwogdx-Cy-1800-Mimosa-002.webp', 1.8),
  product('18M-DISH-MIMOSA-B6X-2PK', '1.8m Dish Mimosa B6x Twist-on 2-pack', 'Dish', 'dish', dish18MimosaImage, 'https://isohorns.s3.us-east-1.amazonaws.com/cyber-antennas/products/1769014685167-o8hwogdx-Cy-1800-Mimosa-002.webp', 1.8),
  product('Diplexer-mszhz72d', 'Diplexer', 'Accessory', 'accessory', diplexerImage, 'https://cyberantennas.s3.us-east-1.amazonaws.com/cyber-antennas/products/1787107100784-p63cq8yk-c15f0353-b2c1-4118-a911-8dcb77d51e87.webp'),
] as const;

export function getCyberAntennaProduct(productId?: string): CyberAntennaProduct {
  return CYBER_ANTENNAS_PRODUCTS.find((candidate) => candidate.id === productId) ?? CYBER_ANTENNAS_PRODUCTS[1]!;
}
