import { WORKSPACE_VERSION, type LinkPlannerWorkspace } from './types';

export class WorkspaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new WorkspaceValidationError(`${path} must be a finite number`);
  }
}

export function validateWorkspace(value: unknown): LinkPlannerWorkspace {
  if (!isRecord(value)) {
    throw new WorkspaceValidationError('workspace must be an object');
  }
  if (value.version !== WORKSPACE_VERSION) {
    throw new WorkspaceValidationError(`workspace.version must be ${WORKSPACE_VERSION}`);
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new WorkspaceValidationError('workspace.id must be a non-empty string');
  }
  if (typeof value.name !== 'string' || value.name.length === 0) {
    throw new WorkspaceValidationError('workspace.name must be a non-empty string');
  }
  if (!Array.isArray(value.sites) || !Array.isArray(value.links)) {
    throw new WorkspaceValidationError('workspace sites and links must be arrays');
  }
  if (!isRecord(value.settings)) {
    throw new WorkspaceValidationError('workspace.settings must be an object');
  }

  const siteIds = new Set<string>();
  value.sites.forEach((site, index) => {
    if (!isRecord(site) || typeof site.id !== 'string' || typeof site.name !== 'string') {
      throw new WorkspaceValidationError(`workspace.sites[${index}] is invalid`);
    }
    if (siteIds.has(site.id)) {
      throw new WorkspaceValidationError(`workspace contains duplicate site id ${site.id}`);
    }
    if (!isRecord(site.location)) {
      throw new WorkspaceValidationError(`workspace.sites[${index}].location is invalid`);
    }
    requireFiniteNumber(site.location.latitude, `workspace.sites[${index}].location.latitude`);
    requireFiniteNumber(site.location.longitude, `workspace.sites[${index}].location.longitude`);
    requireFiniteNumber(site.location.elevationMeters, `workspace.sites[${index}].location.elevationMeters`);
    requireFiniteNumber(site.antennaHeightMeters, `workspace.sites[${index}].antennaHeightMeters`);
    if (site.antennaHeightMeters < 1 || !Number.isInteger(site.antennaHeightMeters)) {
      throw new WorkspaceValidationError(`workspace.sites[${index}].antennaHeightMeters must be whole 1 meter sections`);
    }
    if (site.mounting !== undefined) {
      if (!isRecord(site.mounting) || !['ground', 'rooftop', 'tower'].includes(String(site.mounting.surface))) {
        throw new WorkspaceValidationError(`workspace.sites[${index}].mounting is invalid`);
      }
      requireFiniteNumber(
        site.mounting.buildingHeightMeters,
        `workspace.sites[${index}].mounting.buildingHeightMeters`,
      );
      if (site.mounting.buildingHeightMeters < 0) {
        throw new WorkspaceValidationError(`workspace.sites[${index}].mounting.buildingHeightMeters must not be negative`);
      }
      if (!Number.isInteger(site.mounting.buildingHeightMeters)) {
        throw new WorkspaceValidationError(`workspace.sites[${index}].mounting.buildingHeightMeters must be whole 1 meter sections`);
      }
      if (site.mounting.surface === 'rooftop' && site.mounting.buildingHeightMeters < 1) {
        throw new WorkspaceValidationError(`workspace.sites[${index}].mounting.buildingHeightMeters must be positive for rooftop mounting`);
      }
    }
    if (site.device !== undefined) {
      if (!isRecord(site.device) || typeof site.device.productId !== 'string' || site.device.productId.length === 0) {
        throw new WorkspaceValidationError(`workspace.sites[${index}].device is invalid`);
      }
      requireFiniteNumber(site.device.azimuthDegrees, `workspace.sites[${index}].device.azimuthDegrees`);
      requireFiniteNumber(site.device.tiltDegrees, `workspace.sites[${index}].device.tiltDegrees`);
    }
    if (site.location.latitude < -90 || site.location.latitude > 90) {
      throw new WorkspaceValidationError(`workspace.sites[${index}].location.latitude is out of range`);
    }
    if (site.location.longitude < -180 || site.location.longitude > 180) {
      throw new WorkspaceValidationError(`workspace.sites[${index}].location.longitude is out of range`);
    }
    siteIds.add(site.id);
  });

  value.links.forEach((link, index) => {
    if (!isRecord(link) || typeof link.id !== 'string' || typeof link.name !== 'string') {
      throw new WorkspaceValidationError(`workspace.links[${index}] is invalid`);
    }
    if (typeof link.siteAId !== 'string' || typeof link.siteBId !== 'string') {
      throw new WorkspaceValidationError(`workspace.links[${index}] endpoints are invalid`);
    }
    if (link.siteAId === link.siteBId) {
      throw new WorkspaceValidationError(`workspace.links[${index}] must connect different sites`);
    }
    if (!siteIds.has(link.siteAId) || !siteIds.has(link.siteBId)) {
      throw new WorkspaceValidationError(`workspace.links[${index}] references an unknown site`);
    }
    if (!isRecord(link.radio)) {
      throw new WorkspaceValidationError(`workspace.links[${index}].radio is invalid`);
    }
    requireFiniteNumber(link.radio.frequencyMHz, `workspace.links[${index}].radio.frequencyMHz`);
    requireFiniteNumber(link.radio.channelWidthMHz, `workspace.links[${index}].radio.channelWidthMHz`);
    requireFiniteNumber(link.radio.transmitPowerDbm, `workspace.links[${index}].radio.transmitPowerDbm`);
    requireFiniteNumber(link.radio.antennaGainDbi, `workspace.links[${index}].radio.antennaGainDbi`);
    requireFiniteNumber(link.radio.systemLossDb, `workspace.links[${index}].radio.systemLossDb`);
    if (link.radio.receiverSensitivityDbm !== undefined) {
      requireFiniteNumber(link.radio.receiverSensitivityDbm, `workspace.links[${index}].radio.receiverSensitivityDbm`);
      if (link.radio.receiverSensitivityDbm >= 0) {
        throw new WorkspaceValidationError(`workspace.links[${index}].radio.receiverSensitivityDbm must be negative`);
      }
    }
    if (link.radio.frequencyMHz <= 0) {
      throw new WorkspaceValidationError(`workspace.links[${index}].radio.frequencyMHz must be positive`);
    }
  });

  requireFiniteNumber(value.settings.fresnelClearanceRatio, 'workspace.settings.fresnelClearanceRatio');
  requireFiniteNumber(value.settings.earthCurvatureKFactor, 'workspace.settings.earthCurvatureKFactor');
  if (value.settings.fresnelClearanceRatio < 0 || value.settings.fresnelClearanceRatio > 1) {
    throw new WorkspaceValidationError('workspace.settings.fresnelClearanceRatio must be between 0 and 1');
  }
  if (value.settings.earthCurvatureKFactor <= 0) {
    throw new WorkspaceValidationError('workspace.settings.earthCurvatureKFactor must be positive');
  }

  return value as unknown as LinkPlannerWorkspace;
}
