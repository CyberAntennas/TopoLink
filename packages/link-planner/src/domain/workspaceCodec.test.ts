import { describe, expect, it } from 'vitest';
import { casablancaDemoWorkspace } from '../fixtures/casablancaDemoWorkspace';
import { WorkspaceValidationError, validateWorkspace } from './validation';
import { jsonBase64WorkspaceCodec } from './workspaceCodec';

describe('workspace codec', () => {
  it('round trips UTF-8 workspace data', () => {
    const workspace = { ...casablancaDemoWorkspace, name: 'Réseau côtier' };
    const serialized = jsonBase64WorkspaceCodec.encode(workspace);
    expect(serialized).toMatch(/^topolink-json-v1:/);
    expect(jsonBase64WorkspaceCodec.decode(serialized)).toEqual(workspace);
  });

  it('rejects unknown formats instead of treating them as protobuf', () => {
    expect(() => jsonBase64WorkspaceCodec.decode('not-a-workspace')).toThrow('Unsupported workspace encoding');
  });
});

describe('workspace validation', () => {
  it('rejects links that reference an unknown endpoint', () => {
    const invalid = structuredClone(casablancaDemoWorkspace);
    invalid.links[0]!.siteBId = 'missing-site';
    expect(() => validateWorkspace(invalid)).toThrow(WorkspaceValidationError);
  });

  it('rejects out-of-range coordinates', () => {
    const invalid = structuredClone(casablancaDemoWorkspace);
    invalid.sites[0]!.location.latitude = 91;
    expect(() => validateWorkspace(invalid)).toThrow('latitude is out of range');
  });

  it('accepts tower mounting and enforces whole meter structural sections', () => {
    const tower = structuredClone(casablancaDemoWorkspace);
    tower.sites[0]!.mounting = { surface: 'tower', buildingHeightMeters: 0 };
    tower.sites[0]!.antennaHeightMeters = 42;
    expect(validateWorkspace(tower).sites[0]!.mounting?.surface).toBe('tower');

    tower.sites[0]!.antennaHeightMeters = 42.5;
    expect(() => validateWorkspace(tower)).toThrow('whole 1 meter sections');
  });
});
