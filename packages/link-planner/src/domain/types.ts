export const WORKSPACE_VERSION = 1 as const;

export interface GeoPoint {
  latitude: number;
  longitude: number;
  elevationMeters: number;
}

export interface SiteMounting {
  surface: 'ground' | 'rooftop' | 'tower';
  buildingHeightMeters: number;
}

export interface InstalledDevice {
  productId: string;
  azimuthDegrees: number;
  tiltDegrees: number;
}

export interface RadioConfiguration {
  frequencyMHz: number;
  channelWidthMHz: number;
  transmitPowerDbm: number;
  antennaGainDbi: number;
  systemLossDb: number;
  receiverSensitivityDbm?: number;
}

export interface Site {
  id: string;
  name: string;
  location: GeoPoint;
  antennaHeightMeters: number;
  mounting?: SiteMounting;
  device?: InstalledDevice;
}

export interface RadioLink {
  id: string;
  name: string;
  siteAId: string;
  siteBId: string;
  radio: RadioConfiguration;
}

export interface WorkspaceSettings {
  fresnelClearanceRatio: number;
  earthCurvatureKFactor: number;
}

export interface LinkPlannerWorkspace {
  version: typeof WORKSPACE_VERSION;
  id: string;
  name: string;
  sites: Site[];
  links: RadioLink[];
  settings: WorkspaceSettings;
}
