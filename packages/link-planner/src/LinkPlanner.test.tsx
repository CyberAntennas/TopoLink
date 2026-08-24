import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { casablancaDemoWorkspace } from './fixtures/casablancaDemoWorkspace';

const mapMocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  updateWorkspace: vi.fn(),
  updateLayers: vi.fn(),
  updateSelection: vi.fn(),
  focusSite: vi.fn(),
  resetCamera: vi.fn(),
  sampleTerrainProfile: vi.fn(() => ({
    startAntennaElevationMeters: 40,
    endAntennaElevationMeters: 42,
    distancesMeters: new Float32Array([0, 1_000]),
    elevationsMeters: new Float32Array([10, 12]),
  })),
  mount: vi.fn(),
}));

vi.mock('./map/mountPlannerMap', () => ({
  mountPlannerMap: (...args: unknown[]) => mapMocks.mount(...args),
}));

import { LinkPlanner } from './LinkPlanner';
import { jsonBase64WorkspaceCodec } from './domain/workspaceCodec';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('LinkPlanner', () => {
  it('mounts and tears down its map instance', async () => {
    mapMocks.mount.mockImplementation((_container, options) => {
      options.onLoad();
      return Promise.resolve({ destroy: mapMocks.destroy, updateWorkspace: mapMocks.updateWorkspace, updateLayers: mapMocks.updateLayers, updateSelection: mapMocks.updateSelection, focusSite: mapMocks.focusSite, resetCamera: mapMocks.resetCamera, sampleTerrainProfile: mapMocks.sampleTerrainProfile });
    });

    const { container, unmount } = render(
      <LinkPlanner
        mapDataUrl="/maps/casablanca.pmtiles"
        terrainDataUrl="/terrain/{z}/{x}/{y}.png"
        initialWorkspace={casablancaDemoWorkspace}
      />,
    );

    expect(container.firstChild).toHaveAttribute('data-status', 'ready');
    expect(mapMocks.mount).toHaveBeenCalledOnce();
    await waitFor(() => expect(mapMocks.updateWorkspace).toHaveBeenCalled());
    unmount();
    expect(mapMocks.destroy).toHaveBeenCalledOnce();
  });

  it('reports map errors to the host', async () => {
    const onError = vi.fn();
    mapMocks.mount.mockImplementation((_container, options) => {
      queueMicrotask(() => options.onError(new Error('terrain unavailable')));
      return Promise.resolve({ destroy: mapMocks.destroy, updateWorkspace: mapMocks.updateWorkspace, updateLayers: mapMocks.updateLayers, updateSelection: mapMocks.updateSelection, focusSite: mapMocks.focusSite, resetCamera: mapMocks.resetCamera, sampleTerrainProfile: mapMocks.sampleTerrainProfile });
    });

    render(
      <LinkPlanner
        mapDataUrl="/maps/casablanca.pmtiles"
        terrainDataUrl="/terrain/{z}/{x}/{y}.png"
        initialWorkspace={casablancaDemoWorkspace}
        onError={onError}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Unable to load planner map');
    });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'terrain unavailable' }));
  });

  it('adds a site and emits the serialized workspace', async () => {
    const onWorkspaceChange = vi.fn();
    mapMocks.mount.mockImplementation((_container, options) => {
      options.onLoad();
      return Promise.resolve({ destroy: mapMocks.destroy, updateWorkspace: mapMocks.updateWorkspace, updateLayers: mapMocks.updateLayers, updateSelection: mapMocks.updateSelection, focusSite: mapMocks.focusSite, resetCamera: mapMocks.resetCamera, sampleTerrainProfile: mapMocks.sampleTerrainProfile });
    });
    render(
      <LinkPlanner
        mapDataUrl="/maps/casablanca.pmtiles"
        terrainDataUrl="/terrain/{z}/{x}/{y}.png"
        initialWorkspace={casablancaDemoWorkspace}
        onWorkspaceChange={onWorkspaceChange}
      />,
    );
    await waitFor(() => expect(mapMocks.mount).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Add site' }));
    const options = mapMocks.mount.mock.calls[0]![1];
    act(() => options.onMapClick({ latitude: 33.57, longitude: -7.7, elevationMeters: 0 }));

    expect(onWorkspaceChange).toHaveBeenCalledOnce();
    const workspace = jsonBase64WorkspaceCodec.decode(onWorkspaceChange.mock.calls[0]![0]);
    expect(workspace.sites).toHaveLength(3);
    expect(workspace.sites[2]?.location).toEqual({
      latitude: 33.57,
      longitude: -7.7,
      elevationMeters: 0,
    });
    expect(window.localStorage.getItem(`topolink:${casablancaDemoWorkspace.id}`)).toBe(onWorkspaceChange.mock.calls[0]![0]);
  });

  it('creates a link after selecting two sites', async () => {
    const onWorkspaceChange = vi.fn();
    mapMocks.mount.mockImplementation((_container, options) => {
      options.onLoad();
      return Promise.resolve({ destroy: mapMocks.destroy, updateWorkspace: mapMocks.updateWorkspace, updateLayers: mapMocks.updateLayers, updateSelection: mapMocks.updateSelection, focusSite: mapMocks.focusSite, resetCamera: mapMocks.resetCamera, sampleTerrainProfile: mapMocks.sampleTerrainProfile });
    });
    render(
      <LinkPlanner
        mapDataUrl="/maps/casablanca.pmtiles"
        terrainDataUrl="/terrain/{z}/{x}/{y}.png"
        initialWorkspace={casablancaDemoWorkspace}
        onWorkspaceChange={onWorkspaceChange}
      />,
    );
    await waitFor(() => expect(mapMocks.mount).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    const options = mapMocks.mount.mock.calls[0]![1];
    act(() => options.onSiteClick(casablancaDemoWorkspace.sites[0]!.id));
    act(() => options.onSiteClick(casablancaDemoWorkspace.sites[1]!.id));

    expect(onWorkspaceChange).toHaveBeenCalledOnce();
    const workspace = jsonBase64WorkspaceCodec.decode(onWorkspaceChange.mock.calls[0]![0]);
    expect(workspace.links).toHaveLength(2);
    expect(workspace.links[1]).toMatchObject({
      siteAId: casablancaDemoWorkspace.sites[0]!.id,
      siteBId: casablancaDemoWorkspace.sites[1]!.id,
      radio: { frequencyMHz: 5_800 },
    });
  });

  it('places a selected product on a detected building roof', async () => {
    const onWorkspaceChange = vi.fn();
    mapMocks.mount.mockImplementation((_container, options) => {
      options.onLoad();
      return Promise.resolve({ destroy: mapMocks.destroy, updateWorkspace: mapMocks.updateWorkspace, updateLayers: mapMocks.updateLayers, updateSelection: mapMocks.updateSelection, focusSite: mapMocks.focusSite, resetCamera: mapMocks.resetCamera, sampleTerrainProfile: mapMocks.sampleTerrainProfile });
    });
    render(
      <LinkPlanner
        mapDataUrl="/maps/casablanca.pmtiles"
        terrainDataUrl="/terrain/{z}/{x}/{y}.png"
        initialWorkspace={casablancaDemoWorkspace}
        onWorkspaceChange={onWorkspaceChange}
      />,
    );
    await waitFor(() => expect(mapMocks.mount).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Add site' }));
    const options = mapMocks.mount.mock.calls[0]![1];
    act(() => options.onMapClick({
      latitude: 33.6,
      longitude: -7.64,
      elevationMeters: 12,
      building: { heightMeters: 27, source: 'basemap' },
    }));

    const workspace = jsonBase64WorkspaceCodec.decode(onWorkspaceChange.mock.calls[0]![0]);
    expect(workspace.sites.at(-1)).toMatchObject({
      mounting: { surface: 'rooftop', buildingHeightMeters: 27 },
      device: { productId: 'S30', azimuthDegrees: 0, tiltDegrees: 0 },
    });
  });

  it('selects a clicked building and places a rooftop site from its details', async () => {
    const onWorkspaceChange = vi.fn();
    mapMocks.mount.mockImplementation((_container, options) => {
      options.onLoad();
      return Promise.resolve({ destroy: mapMocks.destroy, updateWorkspace: mapMocks.updateWorkspace, updateLayers: mapMocks.updateLayers, updateSelection: mapMocks.updateSelection, focusSite: mapMocks.focusSite, resetCamera: mapMocks.resetCamera, sampleTerrainProfile: mapMocks.sampleTerrainProfile });
    });
    render(<LinkPlanner mapDataUrl="/map.pmtiles" terrainDataUrl="/terrain/{z}/{x}/{y}.png" initialWorkspace={casablancaDemoWorkspace} onWorkspaceChange={onWorkspaceChange} />);
    await waitFor(() => expect(mapMocks.mount).toHaveBeenCalledOnce());
    const point = { latitude: 33.6, longitude: -7.64, elevationMeters: 12, building: { heightMeters: 31, source: 'basemap' as const, name: 'Central office' } };

    act(() => mapMocks.mount.mock.calls[0]![1].onBuildingClick(point));
    expect(screen.getByText('Building details')).toBeVisible();
    expect(screen.getByText('31 m')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Place site on roof' }));

    const workspace = jsonBase64WorkspaceCodec.decode(onWorkspaceChange.mock.calls[0]![0]);
    expect(workspace.sites.at(-1)?.mounting).toEqual({ surface: 'rooftop', buildingHeightMeters: 31 });
  });

  it('creates and aligns a link from a two-site context selection', async () => {
    const onWorkspaceChange = vi.fn();
    mapMocks.mount.mockImplementation((_container, options) => {
      options.onLoad();
      return Promise.resolve({ destroy: mapMocks.destroy, updateWorkspace: mapMocks.updateWorkspace, updateLayers: mapMocks.updateLayers, updateSelection: mapMocks.updateSelection, focusSite: mapMocks.focusSite, resetCamera: mapMocks.resetCamera, sampleTerrainProfile: mapMocks.sampleTerrainProfile });
    });
    render(<LinkPlanner mapDataUrl="/map.pmtiles" terrainDataUrl="/terrain/{z}/{x}/{y}.png" initialWorkspace={casablancaDemoWorkspace} onWorkspaceChange={onWorkspaceChange} />);
    await waitFor(() => expect(mapMocks.mount).toHaveBeenCalledOnce());
    const options = mapMocks.mount.mock.calls[0]![1];
    act(() => options.onSiteClick(casablancaDemoWorkspace.sites[0]!.id, false));
    act(() => options.onSiteClick(casablancaDemoWorkspace.sites[1]!.id, true));
    act(() => options.onContextMenu({ x: 20, y: 20, point: { latitude: 33.6, longitude: -7.64, elevationMeters: 0 } }));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Create link' }));
    const workspace = jsonBase64WorkspaceCodec.decode(onWorkspaceChange.mock.calls[0]![0]);
    expect(workspace.links).toHaveLength(2);
    expect(workspace.sites[0]!.device!.azimuthDegrees).not.toBe(0);
    expect(workspace.sites[1]!.device!.azimuthDegrees).not.toBe(0);
  });

  it('restores a valid workspace from local storage', () => {
    const stored = { ...casablancaDemoWorkspace, name: 'Stored planning session' };
    window.localStorage.setItem(`topolink:${stored.id}`, jsonBase64WorkspaceCodec.encode(stored));
    mapMocks.mount.mockResolvedValue({ destroy: mapMocks.destroy, updateWorkspace: mapMocks.updateWorkspace, updateLayers: mapMocks.updateLayers, updateSelection: mapMocks.updateSelection, focusSite: mapMocks.focusSite, resetCamera: mapMocks.resetCamera, sampleTerrainProfile: mapMocks.sampleTerrainProfile });

    render(<LinkPlanner mapDataUrl="/map.pmtiles" terrainDataUrl="/terrain/{z}/{x}/{y}.png" initialWorkspace={casablancaDemoWorkspace} />);
    expect(screen.getByRole('heading', { name: 'Stored planning session' })).toBeVisible();
  });

  it('migrates legacy public Wi-Fi point markers to off', async () => {
    const storageKey = `topolink:${casablancaDemoWorkspace.id}`;
    window.localStorage.setItem(`${storageKey}:layers`, JSON.stringify({ 'public-wifi': true }));
    mapMocks.mount.mockResolvedValue({ destroy: mapMocks.destroy, updateWorkspace: mapMocks.updateWorkspace, updateLayers: mapMocks.updateLayers, updateSelection: mapMocks.updateSelection, focusSite: mapMocks.focusSite, resetCamera: mapMocks.resetCamera, sampleTerrainProfile: mapMocks.sampleTerrainProfile });

    const { unmount } = render(<LinkPlanner mapDataUrl="/map.pmtiles" terrainDataUrl="/terrain/{z}/{x}/{y}.png" initialWorkspace={casablancaDemoWorkspace} />);
    fireEvent.click(screen.getByRole('button', { name: 'Map layers' }));

    const wifiSwitch = screen.getByLabelText('OSM public Wi-Fi');
    expect(wifiSwitch).not.toBeChecked();
    fireEvent.click(wifiSwitch);
    expect(wifiSwitch).toBeChecked();
    expect(JSON.parse(window.localStorage.getItem(`${storageKey}:layers`) ?? '{}')).toMatchObject({ 'public-wifi': true, __version: 4 });

    unmount();
    render(<LinkPlanner mapDataUrl="/map.pmtiles" terrainDataUrl="/terrain/{z}/{x}/{y}.png" initialWorkspace={casablancaDemoWorkspace} />);
    fireEvent.click(screen.getByRole('button', { name: 'Map layers' }));
    expect(screen.getByLabelText('OSM public Wi-Fi')).toBeChecked();
  });
});
