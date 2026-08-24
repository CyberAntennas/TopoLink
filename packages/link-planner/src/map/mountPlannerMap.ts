import type { Feature, FeatureCollection } from 'geojson';
import type { ErrorEvent, GeoJSONSource, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { LinkPlannerWorkspace, Site } from '../domain/types';
import {
  haversineDistanceMeters,
  type PublicWifiObservation,
  type TerrainProfileInput,
} from '../engine/rfMath';
import { createTowerLayer, type TowerLayerHandle } from './createTowerLayer';
import {
  findBuildingLinkObstacles,
  type BuildingFootprintCandidate,
  type BuildingLinkObstacle,
} from './buildingObstacles';
import { DEFAULT_PLANNER_LAYERS, type PlannerLayerId, type PlannerLayerState } from './layers';
import { loadOsmBuildingCandidates } from './osmBuildings';
import { snapToOneMeterRoofGrid, type LongitudeLatitude } from './roofGrid';

let protocolRegistered = false;
const TERRAIN_EXAGGERATION = 1.15;

export interface MapPlacement {
  latitude: number;
  longitude: number;
  elevationMeters: number;
  building?: {
    heightMeters: number;
    source: 'basemap' | 'osm-detail';
    heightSource?: BuildingLinkObstacle['heightSource'];
    name?: string;
    footprint?: LongitudeLatitude[];
  };
}

export interface PlannerMapContextRequest {
  x: number;
  y: number;
  point: MapPlacement;
  siteId?: string;
  linkId?: string;
}

export interface PlannerMapHandle {
  updateWorkspace(workspace: LinkPlannerWorkspace): void;
  updateLayers(layers: PlannerLayerState): void;
  updateSelection(siteIds: readonly string[], linkId?: string, building?: MapPlacement, obstacleId?: string): void;
  focusSite(site: Site): void;
  resetCamera(): void;
  sampleTerrainProfile(linkId: string, sampleCount?: number): Omit<TerrainProfileInput, 'frequencyMHz' | 'clearanceRatio' | 'earthCurvatureKFactor'>;
  destroy(): void;
}

export interface MountPlannerMapOptions {
  mapDataUrl: string;
  terrainDataUrl: string;
  workspace: LinkPlannerWorkspace;
  layers: PlannerLayerState;
  onLoad(): void;
  onError(error: Error): void;
  onMapClick(point: MapPlacement): void;
  onBuildingClick(point: MapPlacement & { building: NonNullable<MapPlacement['building']> }): void;
  onSiteClick(siteId: string, multi: boolean): void;
  onLinkClick(linkId: string): void;
  onObstacleClick(obstacle: BuildingLinkObstacle): void;
  onObstaclesChange(obstacles: readonly BuildingLinkObstacle[]): void;
  onContextMenu(request: PlannerMapContextRequest): void;
  onPublicWifiChange(observations: PublicWifiObservation[]): void;
}

function asPmtilesUrl(value: string): string {
  return value.startsWith('pmtiles://') ? value : `pmtiles://${new URL(value, window.location.href).href}`;
}

function resolveTileTemplate(value: string): string {
  return new URL(value, window.location.href).href.replaceAll('%7B', '{').replaceAll('%7D', '}');
}

function pointInRing(longitude: number, latitude: number, ring: readonly number[][]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index];
    const b = ring[previous];
    if (!a || !b) continue;
    const crosses = (a[1]! > latitude) !== (b[1]! > latitude) &&
      longitude < ((b[0]! - a[0]!) * (latitude - a[1]!)) / (b[1]! - a[1]!) + a[0]!;
    if (crosses) inside = !inside;
  }
  return inside;
}

function candidateContains(candidate: BuildingFootprintCandidate, longitude: number, latitude: number): boolean {
  const polygons = candidate.geometry.type === 'Polygon' ? [candidate.geometry.coordinates] : candidate.geometry.coordinates;
  return polygons.some((polygon) => pointInRing(longitude, latitude, polygon[0] ?? []));
}

function createStyle(mapDataUrl: string, terrainDataUrl: string): StyleSpecification {
  const maxzoom = terrainDataUrl.includes('tiles.mapterhorn.com') ? 13 : 22;
  const terrainSource = terrainDataUrl.endsWith('.json')
    ? { type: 'raster-dem' as const, url: new URL(terrainDataUrl, window.location.href).href, tileSize: 256, maxzoom }
    : { type: 'raster-dem' as const, tiles: [resolveTileTemplate(terrainDataUrl)], tileSize: 256, maxzoom, encoding: 'mapbox' as const };
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sources: {
      basemap: { type: 'vector', url: asPmtilesUrl(mapDataUrl) },
      terrain: terrainSource,
      'terrain-hillshade': { ...terrainSource },
    },
    terrain: { source: 'terrain', exaggeration: TERRAIN_EXAGGERATION },
    light: { anchor: 'map', color: '#ffffff', intensity: 0.48, position: [1.2, 205, 35] },
    layers: [
      { id: 'base-background', type: 'background', paint: { 'background-color': 'rgba(232,238,240,0)' } },
      { id: 'base-earth', type: 'fill', source: 'basemap', 'source-layer': 'earth', paint: { 'fill-color': '#e9eeea', 'fill-opacity': 0.28 } },
      { id: 'base-landcover', type: 'fill', source: 'basemap', 'source-layer': 'landcover', paint: { 'fill-color': '#d7e6d6', 'fill-opacity': 0.34 } },
      { id: 'base-landuse', type: 'fill', source: 'basemap', 'source-layer': 'landuse', paint: { 'fill-color': ['match', ['get', 'pmap:kind'], 'park', '#cce4c8', 'cemetery', '#d7e2d4', 'hospital', '#e9dddc', 'school', '#e6e1cd', '#dde5df'], 'fill-opacity': 0.3 } },
      { id: 'base-natural', type: 'fill', source: 'basemap', 'source-layer': 'natural', paint: { 'fill-color': '#c7dfc5', 'fill-opacity': 0.32 } },
      { id: 'base-water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': '#80c6df', 'fill-opacity': 0.96 } },
      { id: 'base-hillshade', type: 'hillshade', source: 'terrain-hillshade', paint: { 'hillshade-shadow-color': '#64777b', 'hillshade-highlight-color': '#f6faf8', 'hillshade-accent-color': '#99a9a4', 'hillshade-exaggeration': 0.16 } },
      { id: 'base-boundaries', type: 'line', source: 'basemap', 'source-layer': 'boundaries', paint: { 'line-color': '#8a999d', 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.7 } },
      { id: 'base-physical-lines', type: 'line', source: 'basemap', 'source-layer': 'physical_line', paint: { 'line-color': '#8fb2a4', 'line-width': 1.1, 'line-opacity': 0.75 } },
      { id: 'base-road-casing', type: 'line', source: 'basemap', 'source-layer': 'roads', paint: { 'line-color': '#c7cfd0', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 16, 7] } },
      { id: 'base-roads', type: 'line', source: 'basemap', 'source-layer': 'roads', paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 16, 5.2] } },
      { id: 'base-transit', type: 'line', source: 'basemap', 'source-layer': 'transit', paint: { 'line-color': '#87969a', 'line-width': 1.6, 'line-dasharray': [2, 1] } },
      {
        id: 'base-buildings-3d',
        type: 'fill-extrusion',
        source: 'basemap',
        'source-layer': 'buildings',
        minzoom: 11,
        paint: {
          'fill-extrusion-color': '#cbd2d1',
          'fill-extrusion-height': ['coalesce', ['to-number', ['get', 'height']], ['*', ['to-number', ['get', 'building:levels']], 3], ['*', ['to-number', ['get', 'building_levels']], 3], 8],
          'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'min_height']], ['to-number', ['get', 'pmap:min_height']], 0],
          'fill-extrusion-opacity': 0.38,
        },
      },
      { id: 'base-building-hit', type: 'fill', source: 'basemap', 'source-layer': 'buildings', minzoom: 11, paint: { 'fill-color': '#000000', 'fill-opacity': 0 } },
      { id: 'base-physical-points', type: 'circle', source: 'basemap', 'source-layer': 'physical_point', minzoom: 12, paint: { 'circle-color': '#7fae80', 'circle-radius': 2.4, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.7 } },
      { id: 'base-place-labels', type: 'symbol', source: 'basemap', 'source-layer': 'places', layout: { 'text-field': ['coalesce', ['get', 'name'], ''], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 15, 15], 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.35 }, paint: { 'text-color': '#42545a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } },
    ],
  };
}

function workspaceGeoJson(
  workspace: LinkPlannerWorkspace,
  selectedSiteIds: ReadonlySet<string> = new Set(),
  selectedLinkId?: string,
  selectedBuilding?: MapPlacement,
): FeatureCollection {
  const siteById = new Map(workspace.sites.map((site) => [site.id, site]));
  const siteFeatures: Feature[] = workspace.sites.map((site) => ({
    type: 'Feature', properties: { id: site.id, name: site.name, featureType: 'site', selected: selectedSiteIds.has(site.id) },
    geometry: { type: 'Point', coordinates: [site.location.longitude, site.location.latitude] },
  }));
  const linkFeatures: Feature[] = workspace.links.flatMap((link) => {
    const a = siteById.get(link.siteAId);
    const b = siteById.get(link.siteBId);
    if (!a || !b) return [];
    return [{
      type: 'Feature', properties: { id: link.id, name: link.name, featureType: 'link', selected: selectedLinkId === link.id },
      geometry: { type: 'LineString', coordinates: [[a.location.longitude, a.location.latitude], [b.location.longitude, b.location.latitude]] },
    }];
  });
  const buildingFeature: Feature[] = selectedBuilding?.building
    ? [{
        type: 'Feature',
        properties: { featureType: 'selected-building' },
        geometry: { type: 'Point', coordinates: [selectedBuilding.longitude, selectedBuilding.latitude] },
      }]
    : [];
  return { type: 'FeatureCollection', features: [...linkFeatures, ...siteFeatures, ...buildingFeature] };
}

function siteAntennaElevation(site: Site): number {
  const roofHeight = site.mounting?.surface === 'rooftop' ? site.mounting.buildingHeightMeters : 0;
  return site.location.elevationMeters + roofHeight + site.antennaHeightMeters + 0.9;
}

interface OverpassElement {
  id: number;
  type: 'node' | 'way' | 'relation';
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface WifiCacheRecord {
  expiresAt: number;
  observations: PublicWifiObservation[];
}

function parseWifiFrequency(tags: Record<string, string> | undefined): number | undefined {
  const value = tags?.frequency ?? tags?.['wifi:frequency'] ?? tags?.['internet_access:frequency'];
  if (!value) return undefined;
  const numeric = Number.parseFloat(value.replace(',', '.'));
  if (!Number.isFinite(numeric)) return undefined;
  if (/ghz/i.test(value)) return numeric * 1_000;
  return numeric < 100 ? numeric * 1_000 : numeric;
}

function wifiBand(frequencyMHz: number | undefined): '2.4' | '5' | '6' | 'unknown' {
  if (frequencyMHz === undefined) return 'unknown';
  if (frequencyMHz < 3_000) return '2.4';
  if (frequencyMHz < 5_925) return '5';
  return '6';
}

function wifiFeatureCollection(observations: readonly PublicWifiObservation[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: observations.map((observation) => ({
      type: 'Feature',
      properties: {
        id: observation.id,
        name: observation.name ?? 'Public Wi-Fi',
        band: wifiBand(observation.frequencyMHz),
        confidence: observation.frequencyMHz === undefined ? 0.72 : 1,
      },
      geometry: { type: 'Point', coordinates: [observation.longitude, observation.latitude] },
    })),
  };
}

function obstacleFeatureCollection(
  _workspace: LinkPlannerWorkspace,
  obstacles: readonly BuildingLinkObstacle[],
  selectedObstacleId?: string,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: obstacles.map((obstacle): Feature => ({
      type: 'Feature',
      properties: {
      id: obstacle.id,
      featureType: 'obstacle',
      selected: obstacle.id === selectedObstacleId,
        obstructed: obstacle.verticalClearanceMeters < 0,
        heightMeters: obstacle.heightMeters,
        heightSource: obstacle.heightSource,
      },
      geometry: obstacle.geometry,
    })),
  };
}

function readWifiCache(key: string): WifiCacheRecord | undefined {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return undefined;
    const parsed = JSON.parse(value) as Partial<WifiCacheRecord>;
    if (!Array.isArray(parsed.observations) || !Number.isFinite(parsed.expiresAt)) return undefined;
    return parsed as WifiCacheRecord;
  } catch {
    return undefined;
  }
}

function writeWifiCache(key: string, record: WifiCacheRecord): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Storage may be unavailable in private mode; live data remains usable.
  }
}

async function fetchPublicWifi(
  bounds: { south: number; west: number; north: number; east: number },
  signal: AbortSignal,
): Promise<PublicWifiObservation[]> {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const query = `[out:json][timeout:20];(nwr["internet_access"="wlan"](${bbox});nwr["amenity"="internet_cafe"](${bbox});nwr["wifi"="yes"](${bbox}););out center tags;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: query }),
    signal,
  });
  if (!response.ok) throw new Error(`Overpass public Wi-Fi request failed with ${response.status}`);
  const payload = await response.json() as { elements?: OverpassElement[] };
  const observations = new Map<string, PublicWifiObservation>();
  for (const element of payload.elements ?? []) {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const id = `${element.type}/${element.id}`;
    observations.set(id, {
      id,
      latitude: latitude!,
      longitude: longitude!,
      frequencyMHz: parseWifiFrequency(element.tags),
      ...(element.tags?.name ? { name: element.tags.name } : {}),
    });
  }
  return [...observations.values()];
}

function addWorkspaceLayers(map: MapLibreMap, workspace: LinkPlannerWorkspace, towerLayer: TowerLayerHandle): void {
  map.addSource('topolink-public-wifi', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'topolink-wifi-coverage',
    type: 'heatmap',
    source: 'topolink-public-wifi',
    maxzoom: 19,
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'confidence'], 0, 0.35, 1, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 0.7, 17, 1.6],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 18, 17, 54],
      'heatmap-opacity': 0.58,
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(43,181,208,0)', 0.25, '#2bb5d0', 0.5, '#27b88f', 0.72, '#f2b84b', 1, '#e85d4a'],
    },
  });
  map.addLayer({
    id: 'topolink-public-wifi',
    type: 'circle',
    source: 'topolink-public-wifi',
    minzoom: 12,
    paint: {
      'circle-color': ['match', ['get', 'band'], '2.4', '#2f8edb', '5', '#0b9f8f', '6', '#e3a52f', '#77868b'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 17, 7],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.92,
    },
  });
  map.addSource('topolink-workspace', { type: 'geojson', data: workspaceGeoJson(workspace) });
  map.addSource('topolink-obstacles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'topolink-link-hit', type: 'line', source: 'topolink-workspace', filter: ['==', ['get', 'featureType'], 'link'], paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0.01 } });
  map.addLayer(towerLayer.layer);
  map.addLayer({ id: 'topolink-obstacle-buildings', type: 'fill-extrusion', source: 'topolink-obstacles', paint: {
    'fill-extrusion-color': ['case', ['get', 'obstructed'], '#ef5b5b', '#f3b34a'],
    'fill-extrusion-height': ['get', 'heightMeters'],
    'fill-extrusion-opacity': 0.42,
  } });
  map.addLayer({ id: 'topolink-building-selection', type: 'circle', source: 'topolink-workspace', filter: ['==', ['get', 'featureType'], 'selected-building'], paint: { 'circle-color': '#ffffff', 'circle-opacity': 0.28, 'circle-radius': 18, 'circle-stroke-color': '#e45745', 'circle-stroke-width': 3 } });
  map.addLayer({ id: 'topolink-sites', type: 'circle', source: 'topolink-workspace', filter: ['==', ['get', 'featureType'], 'site'], paint: { 'circle-color': ['case', ['get', 'selected'], '#fff1ee', '#effffc'], 'circle-radius': ['case', ['get', 'selected'], 12, 9], 'circle-stroke-color': ['case', ['get', 'selected'], '#e45745', '#0a8f83'], 'circle-stroke-width': ['case', ['get', 'selected'], 4, 3], 'circle-opacity': 0.9 } });
}

const layerGroups: Record<Exclude<PlannerLayerId, 'terrain' | 'devices'>, string[]> = {
  land: ['base-earth', 'base-landcover', 'base-landuse', 'base-natural', 'base-physical-lines', 'base-physical-points'],
  water: ['base-water'], roads: ['base-road-casing', 'base-roads'], transit: ['base-transit'],
  boundaries: ['base-boundaries'], 'basemap-buildings': ['base-buildings-3d'], 'public-wifi': ['topolink-public-wifi'], 'wifi-coverage': ['topolink-wifi-coverage'], places: ['base-place-labels'],
  links: ['topolink-link-hit', 'topolink-obstacle-buildings'],
};

export async function mountPlannerMap(container: HTMLElement, options: MountPlannerMapOptions): Promise<PlannerMapHandle> {
  const [maplibre, pmtiles] = await Promise.all([import('maplibre-gl'), import('pmtiles')]);
  maplibre.setWorkerUrl(maplibreWorkerUrl);
  if (!protocolRegistered) {
    const protocol = new pmtiles.Protocol({ metadata: true });
    maplibre.addProtocol('pmtiles', protocol.tile);
    protocolRegistered = true;
  }
  let currentWorkspace = options.workspace;
  let currentLayers = { ...DEFAULT_PLANNER_LAYERS, ...options.layers };
  let selectedSiteIds = new Set<string>();
  let selectedLinkId: string | undefined;
  let selectedBuilding: MapPlacement | undefined;
  let selectedObstacleId: string | undefined;
  let currentObstacles: BuildingLinkObstacle[] = [];
  let detailedBuildingCandidates: BuildingFootprintCandidate[] | undefined;
  let lastObstacleSignature = '';
  let wifiAbortController: AbortController | undefined;
  let wifiRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  let buildingAbortController: AbortController | undefined;
  let destroyed = false;
  const mapHost = document.createElement('div');
  mapHost.className = 'topolink-planner__canvas-host';
  container.appendChild(mapHost);
  const firstSite = options.workspace.sites[0];
  const initialCamera = {
    center: (firstSite ? [firstSite.location.longitude, firstSite.location.latitude] : [-7.62, 33.59]) as [number, number],
    zoom: firstSite ? 14.2 : 10, pitch: 62, bearing: -24,
  };
  const map = new maplibre.Map({ container: mapHost, style: createStyle(options.mapDataUrl, options.terrainDataUrl), ...initialCamera, maxPitch: 85, canvasContextAttributes: { antialias: true }, attributionControl: false });
  map.addControl(new maplibre.NavigationControl({ showCompass: true, showZoom: true, visualizePitch: true }), 'bottom-left');
  map.addControl(new maplibre.AttributionControl({ customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>' }), 'bottom-right');

  const towerLayer = createTowerLayer(maplibre, currentWorkspace);

  const refreshWorkspaceSource = () => {
    map.getSource<GeoJSONSource>('topolink-workspace')?.setData(
      workspaceGeoJson(currentWorkspace, selectedSiteIds, selectedLinkId, selectedBuilding),
    );
  };

  const refreshObstacleSource = () => {
    map.getSource<GeoJSONSource>('topolink-obstacles')?.setData(
      obstacleFeatureCollection(currentWorkspace, currentObstacles, selectedObstacleId),
    );
  };

  const terrainElevationAt = (longitude: number, latitude: number): number | undefined => {
    const elevation = map.queryTerrainElevation({ lng: longitude, lat: latitude });
    if (elevation === null) return undefined;
    return elevation / (currentLayers.terrain ? TERRAIN_EXAGGERATION : 1);
  };

  const plannerFeatureAt = (point: { x: number; y: number }) => {
    const layers = ['topolink-obstacle-buildings', 'topolink-sites', 'topolink-link-hit'].filter((id) => map.getLayer(id));
    return layers.length ? map.queryRenderedFeatures([point.x, point.y], { layers })[0] : undefined;
  };

  const placementAt = (event: { point: { x: number; y: number }; lngLat: { lat: number; lng: number } }): MapPlacement => {
    const localFeature = map.getLayer('base-building-hit')
      ? map.queryRenderedFeatures([event.point.x, event.point.y], { layers: ['base-building-hit'] })[0]
      : undefined;
    const localLevels = Number(localFeature?.properties?.building_levels ?? localFeature?.properties?.levels) || 0;
    const localHeight =
      Number(localFeature?.properties?.height ?? localFeature?.properties?.render_height) ||
      localLevels * 3 ||
      (localFeature ? 5 : 0);
    const detailedBuilding = detailedBuildingCandidates?.find((candidate) =>
      candidateContains(candidate, event.lngLat.lng, event.lngLat.lat),
    );
    const buildingHeight = detailedBuilding?.heightMeters ?? localHeight;
    const name = detailedBuilding?.name ?? localFeature?.properties?.name;
    const geometry = detailedBuilding?.geometry ?? localFeature?.geometry;
    const footprintCoordinates = geometry?.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates[0]?.[0]
        : undefined;
    const footprint = footprintCoordinates?.map((coordinate) => [coordinate[0]!, coordinate[1]!] as LongitudeLatitude);
    const snapped = selectedBuilding?.building?.footprint && buildingHeight > 0
      ? snapToOneMeterRoofGrid(event.lngLat.lng, event.lngLat.lat, selectedBuilding.building.footprint)
      : [event.lngLat.lng, event.lngLat.lat] as LongitudeLatitude;
    return {
      latitude: snapped[1],
      longitude: snapped[0],
      elevationMeters: Math.round(terrainElevationAt(event.lngLat.lng, event.lngLat.lat) ?? 0),
      ...(buildingHeight > 0
        ? {
            building: {
              heightMeters: Math.max(1, Math.round(buildingHeight)),
              source: detailedBuilding ? 'osm-detail' : 'basemap',
              ...(detailedBuilding?.heightSource ? { heightSource: detailedBuilding.heightSource } : {}),
              ...(typeof name === 'string' ? { name } : {}),
              ...(footprint?.length ? { footprint } : {}),
            },
          }
        : {}),
    };
  };

  const applyLayers = (layers: PlannerLayerState) => {
    currentLayers = layers;
    if (map.isStyleLoaded()) {
      for (const [group, ids] of Object.entries(layerGroups) as Array<[keyof typeof layerGroups, string[]]>) {
        for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', layers[group] ? 'visible' : 'none');
      }
      map.setTerrain(layers.terrain ? { source: 'terrain', exaggeration: TERRAIN_EXAGGERATION } : null);
    }
    towerLayer.setVisible(layers.devices);
    towerLayer.setLinksVisible(layers.links);
  };

  const refreshPublicWifi = async () => {
    if (destroyed || !map.isStyleLoaded() || !map.getSource('topolink-public-wifi')) return;
    if (!currentLayers['public-wifi'] && !currentLayers['wifi-coverage']) return;
    const center = map.getCenter();
    const bounds = map.getBounds();
    const halfLatitudeSpan = Math.min(0.15, Math.max(0.01, (bounds.getNorth() - bounds.getSouth()) / 2));
    const halfLongitudeSpan = Math.min(0.15, Math.max(0.01, (bounds.getEast() - bounds.getWest()) / 2));
    const queryBounds = {
      south: Number((center.lat - halfLatitudeSpan).toFixed(5)),
      west: Number((center.lng - halfLongitudeSpan).toFixed(5)),
      north: Number((center.lat + halfLatitudeSpan).toFixed(5)),
      east: Number((center.lng + halfLongitudeSpan).toFixed(5)),
    };
    const cacheKey = `topolink:public-wifi:v1:${center.lat.toFixed(2)}:${center.lng.toFixed(2)}:${Math.floor(map.getZoom())}`;
    const cached = readWifiCache(cacheKey);
    const source = map.getSource<GeoJSONSource>('topolink-public-wifi');
    if (cached) {
      source?.setData(wifiFeatureCollection(cached.observations));
      options.onPublicWifiChange(cached.observations);
      container.dataset.wifiStatus = cached.expiresAt > Date.now() ? 'cached' : 'stale';
      if (cached.expiresAt > Date.now()) return;
    }

    wifiAbortController?.abort();
    const controller = new AbortController();
    wifiAbortController = controller;
    try {
      const observations = await fetchPublicWifi(queryBounds, controller.signal);
      if (destroyed || controller.signal.aborted) return;
      source?.setData(wifiFeatureCollection(observations));
      options.onPublicWifiChange(observations);
      writeWifiCache(cacheKey, { expiresAt: Date.now() + 24 * 60 * 60 * 1_000, observations });
      container.dataset.wifiStatus = 'ready';
    } catch (error) {
      if (destroyed || controller.signal.aborted) return;
      container.dataset.wifiStatus = cached ? 'stale' : 'unavailable';
      // This overlay is advisory; map editing remains available when Overpass is busy or offline.
      console.warn(error instanceof Error ? error.message : 'Public Wi-Fi data is unavailable');
    }
  };

  const schedulePublicWifiRefresh = () => {
    if (wifiRefreshTimer) clearTimeout(wifiRefreshTimer);
    wifiRefreshTimer = setTimeout(() => { void refreshPublicWifi(); }, 350);
  };

  const refreshBuildingObstacles = () => {
    if (destroyed || !map.isStyleLoaded() || !map.getSource('topolink-obstacles')) return;
    const candidates = new Map<string, BuildingFootprintCandidate>();
    if (detailedBuildingCandidates) {
      for (const candidate of detailedBuildingCandidates) candidates.set(candidate.id, candidate);
    } else {
      for (const feature of map.querySourceFeatures('basemap', { sourceLayer: 'buildings' })) {
        if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') continue;
        const geometry = feature.geometry;
        const first = geometry.type === 'Polygon' ? geometry.coordinates[0]?.[0] : geometry.coordinates[0]?.[0]?.[0];
        if (!first) continue;
        const id = String(feature.id ?? `${Number(first[0]).toFixed(6)}:${Number(first[1]).toFixed(6)}`);
        if (candidates.has(id)) continue;
        const explicitHeight = Number(feature.properties?.height ?? feature.properties?.render_height) || 0;
        const levels = Number(feature.properties?.building_levels ?? feature.properties?.levels) || 0;
        const heightMeters = explicitHeight || levels * 3 || 6;
        candidates.set(id, {
          id,
          heightMeters: Math.max(1, heightMeters),
          heightSource: explicitHeight > 0 ? 'basemap-height' : levels > 0 ? 'osm-levels' : 'estimated',
          geometry,
          ...(typeof feature.properties?.name === 'string' ? { name: feature.properties.name } : {}),
        });
      }
    }
    const nextObstacles = findBuildingLinkObstacles(currentWorkspace, [...candidates.values()], { terrainElevationAt });
    const signature = nextObstacles.map((obstacle) =>
      `${obstacle.id}:${obstacle.heightMeters.toFixed(1)}:${obstacle.fresnelClearanceMeters.toFixed(1)}`,
    ).sort().join('|');
    if (signature === lastObstacleSignature) return;
    lastObstacleSignature = signature;
    currentObstacles = nextObstacles;
    refreshObstacleSource();
    towerLayer.setObstacles(currentObstacles);
    options.onObstaclesChange(currentObstacles);
    container.dataset.linkObstacles = String(currentObstacles.length);
  };

  const refreshDetailedBuildings = async () => {
    buildingAbortController?.abort();
    const controller = new AbortController();
    buildingAbortController = controller;
    container.dataset.buildingHeightStatus = 'loading';
    try {
      const result = await loadOsmBuildingCandidates(currentWorkspace, controller.signal);
      if (destroyed || controller.signal.aborted) return;
      detailedBuildingCandidates = result.candidates;
      lastObstacleSignature = '';
      container.dataset.buildingHeightStatus = result.status;
      refreshBuildingObstacles();
    } catch (error) {
      if (destroyed || controller.signal.aborted) return;
      container.dataset.buildingHeightStatus = 'basemap-fallback';
      console.warn(error instanceof Error ? error.message : 'Detailed OSM building heights are unavailable');
      refreshBuildingObstacles();
    }
  };

  map.on('load', () => {
    addWorkspaceLayers(map, currentWorkspace, towerLayer);
    applyLayers(currentLayers);
    for (const id of ['topolink-sites', 'topolink-link-hit', 'topolink-obstacle-buildings']) {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    }
    options.onLoad();
    schedulePublicWifiRefresh();
    refreshBuildingObstacles();
    void refreshDetailedBuildings();
  });
  map.on('moveend', schedulePublicWifiRefresh);
  map.on('idle', refreshBuildingObstacles);

  map.on('click', (event) => {
    const plannerFeature = plannerFeatureAt(event.point);
    const featureType = plannerFeature?.properties?.featureType;
    const featureId = plannerFeature?.properties?.id;
    if (featureType === 'site' && typeof featureId === 'string') {
      options.onSiteClick(featureId, Boolean(event.originalEvent.shiftKey));
      return;
    }
    if (featureType === 'link' && typeof featureId === 'string') {
      options.onLinkClick(featureId);
      return;
    }
    if (featureType === 'obstacle' && typeof featureId === 'string') {
      const obstacle = currentObstacles.find((candidate) => candidate.id === featureId);
      if (obstacle) options.onObstacleClick(obstacle);
      return;
    }
    const point = placementAt(event);
    if (point.building) options.onBuildingClick(point as MapPlacement & { building: NonNullable<MapPlacement['building']> });
    else options.onMapClick(point);
  });
  map.on('contextmenu', (event) => {
    event.originalEvent.preventDefault();
    const plannerFeature = plannerFeatureAt(event.point);
    const featureType = plannerFeature?.properties?.featureType;
    const featureId = plannerFeature?.properties?.id;
    options.onContextMenu({
      x: event.point.x,
      y: event.point.y,
      point: placementAt(event),
      ...(featureType === 'site' && typeof featureId === 'string' ? { siteId: featureId } : {}),
      ...(featureType === 'link' && typeof featureId === 'string' ? { linkId: featureId } : {}),
    });
  });
  map.on('error', (event: ErrorEvent) => {
    container.dataset.mapError = event.error.message;
    options.onError(new Error(event.error.message));
  });

  return {
    updateWorkspace(workspace) {
      currentWorkspace = workspace;
      detailedBuildingCandidates = undefined;
      lastObstacleSignature = '';
      refreshWorkspaceSource();
      towerLayer.updateWorkspace(workspace);
      refreshBuildingObstacles();
      void refreshDetailedBuildings();
    },
    updateLayers(layers) {
      applyLayers(layers);
      schedulePublicWifiRefresh();
    },
    updateSelection(siteIds, linkId, building, obstacleId) {
      selectedSiteIds = new Set(siteIds);
      selectedLinkId = linkId;
      selectedBuilding = building?.building ? building : undefined;
      selectedObstacleId = obstacleId;
      refreshWorkspaceSource();
      refreshObstacleSource();
      towerLayer.setRoofGrid(selectedBuilding?.building?.footprint ? {
        longitude: selectedBuilding.longitude,
        latitude: selectedBuilding.latitude,
        baseElevationMeters: selectedBuilding.elevationMeters,
        roofHeightMeters: selectedBuilding.building.heightMeters,
        footprint: selectedBuilding.building.footprint,
      } : undefined);
    },
    focusSite(site) {
      const towerHeight = site.antennaHeightMeters;
      const baseZoom = towerHeight >= 60 ? 18 : towerHeight >= 35 ? 18.4 : 18.75;
      const zoom = map.getContainer().clientWidth <= 720 ? baseZoom - 0.45 : baseZoom;
      const verticalOffset = Math.min(300, Math.round(map.getContainer().clientHeight * 0.33));
      map.getContainer().dataset.focusedSite = site.id;
      map.getContainer().dataset.focusZoom = String(zoom);
      map.easeTo({
        center: [site.location.longitude, site.location.latitude],
        zoom,
        pitch: 64,
        bearing: site.device?.azimuthDegrees ?? 0,
        offset: [0, verticalOffset],
        duration: 900,
      });
    },
    resetCamera() { map.easeTo({ ...initialCamera, duration: 900 }); },
    sampleTerrainProfile(linkId, sampleCount = 96) {
      const link = currentWorkspace.links.find((candidate) => candidate.id === linkId);
      const siteA = currentWorkspace.sites.find((site) => site.id === link?.siteAId);
      const siteB = currentWorkspace.sites.find((site) => site.id === link?.siteBId);
      if (!link || !siteA || !siteB) throw new Error(`Cannot sample unknown link ${linkId}`);
      const count = Math.max(2, Math.min(512, Math.round(sampleCount)));
      const totalDistance = haversineDistanceMeters(siteA.location, siteB.location);
      const distancesMeters = new Float32Array(count);
      const elevationsMeters = new Float32Array(count);
      for (let index = 0; index < count; index += 1) {
        const fraction = index / (count - 1);
        const longitude = siteA.location.longitude + (siteB.location.longitude - siteA.location.longitude) * fraction;
        const latitude = siteA.location.latitude + (siteB.location.latitude - siteA.location.latitude) * fraction;
        const fallbackElevation =
          siteA.location.elevationMeters +
          (siteB.location.elevationMeters - siteA.location.elevationMeters) * fraction;
        distancesMeters[index] = totalDistance * fraction;
        elevationsMeters[index] = terrainElevationAt(longitude, latitude) ?? fallbackElevation;
      }
      return {
        startAntennaElevationMeters: siteAntennaElevation(siteA),
        endAntennaElevationMeters: siteAntennaElevation(siteB),
        distancesMeters,
        elevationsMeters,
      };
    },
    destroy() {
      destroyed = true;
      wifiAbortController?.abort();
      buildingAbortController?.abort();
      if (wifiRefreshTimer) clearTimeout(wifiRefreshTimer);
      map.remove();
      mapHost.remove();
    },
  };
}
