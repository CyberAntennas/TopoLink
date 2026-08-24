import { WORKSPACE_VERSION, type LinkPlannerWorkspace } from '../domain/types';

export const casablancaDemoWorkspace: LinkPlannerWorkspace = {
  version: WORKSPACE_VERSION,
  id: 'workspace-casablanca-coastal-link',
  name: 'Casablanca coastal backhaul',
  sites: [
    {
      id: 'site-hassan-ii',
      name: 'Hassan II rooftop',
      location: { latitude: 33.6084, longitude: -7.6326, elevationMeters: 8 },
      antennaHeightMeters: 35,
      mounting: { surface: 'rooftop', buildingHeightMeters: 62 },
      device: { productId: 'S30', azimuthDegrees: 252, tiltDegrees: 0 },
    },
    {
      id: 'site-ain-diab',
      name: 'Ain Diab relay',
      location: { latitude: 33.5948, longitude: -7.6789, elevationMeters: 18 },
      antennaHeightMeters: 28,
      mounting: { surface: 'rooftop', buildingHeightMeters: 18 },
      device: { productId: '06M-DISH-HP', azimuthDegrees: 72, tiltDegrees: 0 },
    },
  ],
  links: [
    {
      id: 'link-coastal-primary',
      name: 'Coastal primary',
      siteAId: 'site-hassan-ii',
      siteBId: 'site-ain-diab',
      radio: {
        frequencyMHz: 5_800,
        channelWidthMHz: 40,
        transmitPowerDbm: 27,
        antennaGainDbi: 24,
        systemLossDb: 2,
      },
    },
  ],
  settings: {
    fresnelClearanceRatio: 0.6,
    earthCurvatureKFactor: 4 / 3,
  },
};
