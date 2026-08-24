import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PlannerToolbar, type PlannerMode } from './components/PlannerToolbar';
import { LayerPalette } from './components/LayerPalette';
import { PlannerContextMenu } from './components/PlannerContextMenu';
import { WifiLegend } from './components/WifiLegend';
import {
  WorkspaceInspector,
  type PlannerSelection,
  type SelectedLinkAnalysis,
} from './components/WorkspaceInspector';
import type { LinkPlannerWorkspace, RadioLink, Site } from './domain/types';
import { validateWorkspace } from './domain/validation';
import { jsonBase64WorkspaceCodec, type WorkspaceCodec } from './domain/workspaceCodec';
import { createPlannerEngine, type PlannerEngine } from './engine/PlannerEngine';
import {
  assessPublicWifiInterference,
  calculateOptimalLinkAlignment,
  type PublicWifiObservation,
} from './engine/rfMath';
import {
  mountPlannerMap,
  type MapPlacement,
  type PlannerMapContextRequest,
  type PlannerMapHandle,
} from './map/mountPlannerMap';
import { DEFAULT_PLANNER_LAYERS, type PlannerLayerId, type PlannerLayerState } from './map/layers';

const LAYER_STORAGE_VERSION = 4;
import type { BuildingLinkObstacle } from './map/buildingObstacles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

export interface LinkPlannerProps {
  mapDataUrl: string;
  terrainDataUrl: string;
  initialWorkspace: LinkPlannerWorkspace | string;
  onWorkspaceChange?: (serializedWorkspace: string) => void;
  onError?: (error: Error) => void;
  workspaceCodec?: WorkspaceCodec;
  storageKey?: string | false;
  className?: string;
  style?: CSSProperties;
}

function createEntityId(prefix: string): string {
  const uniquePart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uniquePart}`;
}

function siteAntennaElevation(site: Site): number {
  return site.location.elevationMeters +
    (site.mounting?.surface === 'rooftop' ? site.mounting.buildingHeightMeters : 0) +
    site.antennaHeightMeters + 0.9;
}

function readStoredWorkspace(
  key: string | false,
  fallback: LinkPlannerWorkspace,
  codec: WorkspaceCodec,
): { workspace: LinkPlannerWorkspace; error?: Error } {
  if (!key || typeof window === 'undefined') return { workspace: fallback };
  try {
    const serialized = window.localStorage.getItem(key);
    return { workspace: serialized ? codec.decode(serialized) : fallback };
  } catch (error) {
    return { workspace: fallback, error: error instanceof Error ? error : new Error('Stored workspace is invalid') };
  }
}

function readStoredLayers(key: string | false): PlannerLayerState {
  if (!key || typeof window === 'undefined') return DEFAULT_PLANNER_LAYERS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${key}:layers`) ?? '{}') as Partial<PlannerLayerState> & { __version?: number };
    const next = { ...DEFAULT_PLANNER_LAYERS };
    for (const id of Object.keys(DEFAULT_PLANNER_LAYERS) as PlannerLayerId[]) {
      if (typeof parsed[id] === 'boolean') next[id] = parsed[id];
    }
    if ((parsed.__version ?? 1) < LAYER_STORAGE_VERSION) {
      next['public-wifi'] = false;
      next['basemap-buildings'] = true;
    }
    return next;
  } catch {
    return DEFAULT_PLANNER_LAYERS;
  }
}

export function LinkPlanner({
  mapDataUrl,
  terrainDataUrl,
  initialWorkspace,
  onWorkspaceChange,
  onError,
  workspaceCodec = jsonBase64WorkspaceCodec,
  storageKey,
  className,
  style,
}: LinkPlannerProps) {
  const providedWorkspace = useMemo(
    () =>
      typeof initialWorkspace === 'string'
        ? workspaceCodec.decode(initialWorkspace)
        : validateWorkspace(initialWorkspace),
    [initialWorkspace, workspaceCodec],
  );
  const effectiveStorageKey = storageKey === false ? false : storageKey ?? `topolink:${providedWorkspace.id}`;
  const storedWorkspace = useMemo(
    () => readStoredWorkspace(effectiveStorageKey, providedWorkspace, workspaceCodec),
    [effectiveStorageKey, providedWorkspace, workspaceCodec],
  );
  const hydratedWorkspace = storedWorkspace.workspace;
  const [workspace, setWorkspace] = useState(hydratedWorkspace);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<PlannerMapHandle | null>(null);
  const engineRef = useRef<PlannerEngine | null>(null);
  const mapLoadedRef = useRef(false);
  const latestWorkspaceRef = useRef(workspace);
  latestWorkspaceRef.current = workspace;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mode, setMode] = useState<PlannerMode>('select');
  const [selection, setSelection] = useState<PlannerSelection>(null);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<PlannerMapContextRequest>();
  const [publicWifi, setPublicWifi] = useState<PublicWifiObservation[]>([]);
  const [buildingObstacles, setBuildingObstacles] = useState<BuildingLinkObstacle[]>([]);
  const [pendingLinkSiteId, setPendingLinkSiteId] = useState<string>();
  const [panelOpen, setPanelOpen] = useState(true);
  const [layerPaletteOpen, setLayerPaletteOpen] = useState(false);
  const [layers, setLayers] = useState(() => readStoredLayers(effectiveStorageKey));
  const [linkAnalysis, setLinkAnalysis] = useState<SelectedLinkAnalysis>();

  useEffect(() => {
    if (storedWorkspace.error) onError?.(new Error(`Unable to restore local workspace: ${storedWorkspace.error.message}`));
  }, [onError, storedWorkspace.error]);

  useEffect(() => {
    const engine = createPlannerEngine();
    engineRef.current = engine;
    return () => {
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    latestWorkspaceRef.current = hydratedWorkspace;
    setWorkspace(hydratedWorkspace);
    setSelection(null);
    setSelectedSiteIds([]);
    setContextMenu(undefined);
    setPendingLinkSiteId(undefined);
  }, [hydratedWorkspace]);

  const commitWorkspace = useCallback(
    (update: (current: LinkPlannerWorkspace) => LinkPlannerWorkspace) => {
      const nextWorkspace = validateWorkspace(update(latestWorkspaceRef.current));
      latestWorkspaceRef.current = nextWorkspace;
      setWorkspace(nextWorkspace);
      const serialized = workspaceCodec.encode(nextWorkspace);
      if (effectiveStorageKey && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(effectiveStorageKey, serialized);
        } catch (error) {
          onError?.(error instanceof Error ? error : new Error('Unable to persist workspace locally'));
        }
      }
      onWorkspaceChange?.(serialized);
    },
    [effectiveStorageKey, onError, onWorkspaceChange, workspaceCodec],
  );

  const handleModeChange = (nextMode: PlannerMode) => {
    setMode(nextMode);
    if (nextMode !== 'add-link') setPendingLinkSiteId(undefined);
  };

  const placeSite = useCallback((point: MapPlacement) => {
    const { building, ...location } = point;
    const site: Site = {
      id: createEntityId('site'),
      name: `Site ${latestWorkspaceRef.current.sites.length + 1}`,
      location,
      antennaHeightMeters: 10,
      mounting: {
        surface: building ? 'rooftop' : 'ground',
        buildingHeightMeters: building?.heightMeters ?? 0,
      },
      device: { productId: 'S30', azimuthDegrees: 0, tiltDegrees: 0 },
    };
    commitWorkspace((current) => ({ ...current, sites: [...current.sites, site] }));
    setSelection({ kind: 'site', id: site.id });
    setSelectedSiteIds([site.id]);
    setContextMenu(undefined);
    setMode('select');
  }, [commitWorkspace]);

  const autoAlignLink = useCallback((linkId: string) => {
    const current = latestWorkspaceRef.current;
    const link = current.links.find((candidate) => candidate.id === linkId);
    const siteA = current.sites.find((site) => site.id === link?.siteAId);
    const siteB = current.sites.find((site) => site.id === link?.siteBId);
    if (!link || !siteA || !siteB) {
      onError?.(new Error(`Cannot align unknown link ${linkId}`));
      return;
    }
    try {
      const alignment = calculateOptimalLinkAlignment(
        siteA.location,
        siteAntennaElevation(siteA),
        siteB.location,
        siteAntennaElevation(siteB),
      );
      commitWorkspace((workspace) => ({
        ...workspace,
        sites: workspace.sites.map((site) => {
          if (site.id !== siteA.id && site.id !== siteB.id) return site;
          const isA = site.id === siteA.id;
          const device = site.device ?? { productId: 'S30', azimuthDegrees: 0, tiltDegrees: 0 };
          return {
            ...site,
            device: {
              ...device,
              azimuthDegrees: Number((isA ? alignment.siteAAzimuthDegrees : alignment.siteBAzimuthDegrees).toFixed(1)),
              tiltDegrees: Number((isA ? alignment.siteATiltDegrees : alignment.siteBTiltDegrees).toFixed(2)),
            },
          };
        }),
      }));
      setSelection({ kind: 'link', id: link.id });
      setSelectedSiteIds([]);
      setContextMenu(undefined);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Antenna alignment failed'));
    }
  }, [commitWorkspace, onError]);

  const createLinkBetween = useCallback((siteAId: string, siteBId: string) => {
    if (siteAId === siteBId) return;
    const current = latestWorkspaceRef.current;
    const siteA = current.sites.find((site) => site.id === siteAId);
    const siteB = current.sites.find((site) => site.id === siteBId);
    if (!siteA || !siteB) {
      onError?.(new Error('Both selected sites must exist before creating a link'));
      return;
    }
    const link: RadioLink = {
      id: createEntityId('link'),
      name: `${siteA.name} to ${siteB.name}`,
      siteAId: siteA.id,
      siteBId: siteB.id,
      radio: { frequencyMHz: 5_800, channelWidthMHz: 40, transmitPowerDbm: 27, antennaGainDbi: 24, systemLossDb: 2, receiverSensitivityDbm: -75 },
    };
    const alignment = calculateOptimalLinkAlignment(
      siteA.location,
      siteAntennaElevation(siteA),
      siteB.location,
      siteAntennaElevation(siteB),
    );
    commitWorkspace((workspace) => ({
      ...workspace,
      sites: workspace.sites.map((site) => {
        if (site.id !== siteA.id && site.id !== siteB.id) return site;
        const isA = site.id === siteA.id;
        const device = site.device ?? { productId: 'S30', azimuthDegrees: 0, tiltDegrees: 0 };
        return {
          ...site,
          device: {
            ...device,
            azimuthDegrees: Number((isA ? alignment.siteAAzimuthDegrees : alignment.siteBAzimuthDegrees).toFixed(1)),
            tiltDegrees: Number((isA ? alignment.siteATiltDegrees : alignment.siteBTiltDegrees).toFixed(2)),
          },
        };
      }),
      links: [...workspace.links, link],
    }));
    setSelection({ kind: 'link', id: link.id });
    setSelectedSiteIds([]);
    setPendingLinkSiteId(undefined);
    setContextMenu(undefined);
    setMode('select');
  }, [commitWorkspace, onError]);

  const handleMapClick = useCallback((point: MapPlacement) => {
    setContextMenu(undefined);
    if (mode === 'add-site') placeSite(point);
    else {
      setSelection(null);
      setSelectedSiteIds([]);
    }
  }, [mode, placeSite]);

  const handleBuildingClick = useCallback((point: MapPlacement & { building: NonNullable<MapPlacement['building']> }) => {
    setContextMenu(undefined);
    if (mode === 'add-site') placeSite(point);
    else {
      setSelection({ kind: 'building', point });
      setSelectedSiteIds([]);
    }
  }, [mode, placeSite]);

  const handleSiteClick = useCallback((siteId: string, multi = false) => {
    setContextMenu(undefined);
    setSelection({ kind: 'site', id: siteId });
    setSelectedSiteIds((current) => {
      if (!multi) return [siteId];
      if (current.includes(siteId)) return current.filter((id) => id !== siteId);
      return [...current.slice(-1), siteId];
    });
    if (mode !== 'add-link') return;
    if (!pendingLinkSiteId || pendingLinkSiteId === siteId) {
      setPendingLinkSiteId(siteId);
      return;
    }
    createLinkBetween(pendingLinkSiteId, siteId);
  }, [createLinkBetween, mode, pendingLinkSiteId]);

  const handleSiteChange = (site: Site) => {
    commitWorkspace((current) => ({
      ...current,
      sites: current.sites.map((candidate) => (candidate.id === site.id ? site : candidate)),
    }));
  };

  const handleLinkChange = (link: RadioLink) => {
    commitWorkspace((current) => ({
      ...current,
      links: current.links.map((candidate) => (candidate.id === link.id ? link : candidate)),
    }));
  };

  const handleDeleteSelection = () => {
    if (!selection || (selection.kind !== 'site' && selection.kind !== 'link')) return;
    commitWorkspace((current) =>
      selection.kind === 'site'
        ? {
            ...current,
            sites: current.sites.filter((site) => site.id !== selection.id),
            links: current.links.filter(
              (link) => link.siteAId !== selection.id && link.siteBId !== selection.id,
            ),
          }
        : { ...current, links: current.links.filter((link) => link.id !== selection.id) },
    );
    setSelection(null);
    setSelectedSiteIds([]);
    setPendingLinkSiteId(undefined);
  };

  const handleContextMenu = useCallback((request: PlannerMapContextRequest) => {
    const host = containerRef.current;
    const width = 224;
    const height = 190;
    setContextMenu({
      ...request,
      x: Math.max(8, Math.min(request.x, (host?.clientWidth ?? request.x + width) - width - 8)),
      y: Math.max(8, Math.min(request.y, (host?.clientHeight ?? request.y + height) - height - 8)),
    });
    if (request.siteId) {
      setSelection({ kind: 'site', id: request.siteId });
      setSelectedSiteIds((current) => current.includes(request.siteId!) ? current : [...current.slice(-1), request.siteId!]);
    }
    else if (request.linkId) setSelection({ kind: 'link', id: request.linkId });
    else if (request.point.building) setSelection({ kind: 'building', point: request.point as MapPlacement & { building: NonNullable<MapPlacement['building']> } });
  }, []);

  const handleLinkSelection = useCallback((linkId: string) => {
    setSelection({ kind: 'link', id: linkId });
    setSelectedSiteIds([]);
    setContextMenu(undefined);
  }, []);

  const handleObstacleSelection = useCallback((obstacle: BuildingLinkObstacle) => {
    setSelection({ kind: 'obstacle', obstacle });
    setSelectedSiteIds([]);
    setContextMenu(undefined);
  }, []);

  const interactionRef = useRef({ handleMapClick, handleBuildingClick, handleSiteClick, handleContextMenu, handleLinkSelection, handleObstacleSelection, setPublicWifi });
  interactionRef.current = { handleMapClick, handleBuildingClick, handleSiteClick, handleContextMenu, handleLinkSelection, handleObstacleSelection, setPublicWifi };

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    mapLoadedRef.current = false;
    setStatus('loading');
    const reportError = (error: Error) => {
      if (disposed) return;
      if (!mapLoadedRef.current) setStatus('error');
      onError?.(error);
    };
    void mountPlannerMap(containerRef.current, {
      mapDataUrl,
      terrainDataUrl,
      workspace,
      layers,
      onLoad: () => {
        if (disposed) return;
        mapLoadedRef.current = true;
        setStatus('ready');
      },
      onError: reportError,
      onMapClick: (point) => interactionRef.current.handleMapClick(point),
      onBuildingClick: (point) => interactionRef.current.handleBuildingClick(point),
      onSiteClick: (siteId, multi) => interactionRef.current.handleSiteClick(siteId, multi),
      onLinkClick: (linkId) => interactionRef.current.handleLinkSelection(linkId),
      onObstacleClick: (obstacle) => interactionRef.current.handleObstacleSelection(obstacle),
      onObstaclesChange: (obstacles) => setBuildingObstacles([...obstacles]),
      onContextMenu: (request) => interactionRef.current.handleContextMenu(request),
      onPublicWifiChange: (observations) => interactionRef.current.setPublicWifi(observations),
    })
      .then((map) => {
        if (disposed) {
          map.destroy();
          return;
        }
        mapRef.current = map;
        map.updateWorkspace(latestWorkspaceRef.current);
        map.updateSelection(selectedSiteIds);
      })
      .catch(reportError);

    return () => {
      disposed = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [mapDataUrl, onError, terrainDataUrl]);

  useEffect(() => {
    mapRef.current?.updateWorkspace(workspace);
  }, [workspace]);

  useEffect(() => {
    mapRef.current?.updateLayers(layers);
  }, [layers]);

  useEffect(() => {
    mapRef.current?.updateSelection(
      selectedSiteIds,
      selection?.kind === 'link' ? selection.id : undefined,
      selection?.kind === 'building' ? selection.point : undefined,
      selection?.kind === 'obstacle' ? selection.obstacle.id : undefined,
    );
  }, [selectedSiteIds, selection]);

  useEffect(() => {
    if (selection?.kind !== 'site') return;
    const site = workspace.sites.find((candidate) => candidate.id === selection.id);
    if (site) mapRef.current?.focusSite(site);
  }, [selection, workspace.sites]);

  useEffect(() => {
    let cancelled = false;
    if (selection?.kind !== 'link' || !mapRef.current || !engineRef.current) {
      setLinkAnalysis(undefined);
      return () => { cancelled = true; };
    }
    const link = workspace.links.find((candidate) => candidate.id === selection.id);
    if (!link) {
      setLinkAnalysis(undefined);
      return () => { cancelled = true; };
    }
    const siteA = workspace.sites.find((site) => site.id === link.siteAId);
    const siteB = workspace.sites.find((site) => site.id === link.siteBId);
    if (!siteA || !siteB) {
      setLinkAnalysis(undefined);
      return () => { cancelled = true; };
    }
    const alignment = calculateOptimalLinkAlignment(
      siteA.location,
      siteAntennaElevation(siteA),
      siteB.location,
      siteAntennaElevation(siteB),
    );
    const interference = assessPublicWifiInterference(siteA.location, siteB.location, publicWifi);
    const samples = mapRef.current.sampleTerrainProfile(link.id);
    const linkObstacles = buildingObstacles.filter((obstacle) => obstacle.linkId === link.id);
    const buildingLossDb = Math.min(40, linkObstacles.reduce((total, obstacle) => total + obstacle.estimatedDiffractionLossDb, 0));
    const distanceMeters = samples.distancesMeters[samples.distancesMeters.length - 1]!;
    void Promise.all([
      engineRef.current.linkBudget(link.radio, distanceMeters),
      engineRef.current.terrainProfile({
        ...samples,
        frequencyMHz: link.radio.frequencyMHz,
        clearanceRatio: workspace.settings.fresnelClearanceRatio,
        earthCurvatureKFactor: workspace.settings.earthCurvatureKFactor,
      }),
    ])
      .then(([budget, profile]) => {
        if (!cancelled) setLinkAnalysis({
          linkId: link.id,
          budget: {
            ...budget,
            receivedPowerDbm: budget.receivedPowerDbm - buildingLossDb,
            linkMarginDb: budget.linkMarginDb - buildingLossDb,
          },
          buildingLossDb,
          obstructingBuildingCount: linkObstacles.length,
          profile,
          alignment,
          interference,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) onError?.(error instanceof Error ? error : new Error('Link analysis failed'));
      });
    return () => { cancelled = true; };
  }, [buildingObstacles, onError, publicWifi, selection, workspace]);

  const handleLayerChange = (id: PlannerLayerId, visible: boolean) => {
    setLayers((current) => {
      const next = { ...current, [id]: visible };
      if (effectiveStorageKey && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(`${effectiveStorageKey}:layers`, JSON.stringify({ ...next, __version: LAYER_STORAGE_VERSION }));
        } catch (error) {
          onError?.(error instanceof Error ? error : new Error('Unable to persist layer settings'));
        }
      }
      return next;
    });
  };

  return (
    <div
      className={['topolink-planner', className].filter(Boolean).join(' ')}
      data-status={status}
      style={style}
    >
      <div className="topolink-planner__map" ref={containerRef} />
      <PlannerToolbar
        mode={mode}
        layerPaletteOpen={layerPaletteOpen}
        onLayerPaletteToggle={() => setLayerPaletteOpen((current) => !current)}
        onModeChange={handleModeChange}
        onPanelToggle={() => setPanelOpen((current) => !current)}
        onResetCamera={() => mapRef.current?.resetCamera()}
        panelOpen={panelOpen}
        pendingLinkSiteName={workspace.sites.find((site) => site.id === pendingLinkSiteId)?.name}
      />
      {layerPaletteOpen && <LayerPalette layers={layers} onChange={handleLayerChange} />}
      {!layerPaletteOpen && (layers['public-wifi'] || layers['wifi-coverage']) && <WifiLegend />}
      {panelOpen && (
        <WorkspaceInspector
          linkAnalysis={linkAnalysis}
          onAutoAlignLink={autoAlignLink}
          onDeleteSelection={handleDeleteSelection}
          onLinkChange={handleLinkChange}
          onPlaceBuildingSite={placeSite}
          onSelectionChange={(nextSelection) => {
            setSelection(nextSelection);
            setSelectedSiteIds([]);
            setContextMenu(undefined);
          }}
          onSiteSelection={handleSiteClick}
          onSiteChange={handleSiteChange}
          selection={selection}
          selectedSiteIds={selectedSiteIds}
          workspace={workspace}
        />
      )}
      {contextMenu && (
        <PlannerContextMenu
          onAutoAlign={() => contextMenu.linkId && autoAlignLink(contextMenu.linkId)}
          onCreateLink={() => {
            if (selectedSiteIds.length === 2) createLinkBetween(selectedSiteIds[0]!, selectedSiteIds[1]!);
          }}
          onPlaceSite={() => placeSite(contextMenu.point)}
          onToggleSite={() => contextMenu.siteId && handleSiteClick(contextMenu.siteId, true)}
          request={contextMenu}
          selectedSiteIds={selectedSiteIds}
        />
      )}
      {status !== 'ready' && (
        <div className="topolink-planner__status" role="status">
          {status === 'error' ? 'Unable to load planner map' : 'Loading planner'}
        </div>
      )}
    </div>
  );
}
