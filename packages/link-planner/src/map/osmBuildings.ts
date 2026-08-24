import type { Polygon } from 'geojson';
import type { LinkPlannerWorkspace } from '../domain/types';
import type { BuildingFootprintCandidate, BuildingHeightSource } from './buildingObstacles';

const CACHE_VERSION = 1;
const CACHE_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;

interface OverpassGeometryPoint { lat: number; lon: number }
interface OverpassBuildingWay {
  id: number;
  type: 'way';
  tags?: Record<string, string>;
  geometry?: OverpassGeometryPoint[];
}

interface CachedBuildings {
  expiresAt: number;
  candidates: BuildingFootprintCandidate[];
}

export interface OsmBuildingLoadResult {
  candidates: BuildingFootprintCandidate[];
  status: 'ready' | 'cached' | 'stale';
}

function parseFinite(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function parseOsmLengthMeters(value: string | undefined): number | undefined {
  const numeric = parseFinite(value);
  if (numeric === undefined) return undefined;
  if (value && /(?:ft|feet|foot|')/i.test(value)) return numeric * 0.3048;
  return numeric;
}

export function osmBuildingHeight(tags: Record<string, string>): {
  heightMeters: number;
  source: BuildingHeightSource;
} {
  const explicitHeight = parseOsmLengthMeters(tags.height);
  if (explicitHeight !== undefined && explicitHeight > 0) {
    return { heightMeters: explicitHeight, source: 'osm-height' };
  }
  const levels = parseFinite(tags['building:levels']);
  if (levels !== undefined && levels > 0) {
    const roofHeight = parseOsmLengthMeters(tags['roof:height']) ?? (parseFinite(tags['roof:levels']) ?? 0) * 3;
    return { heightMeters: levels * 3 + roofHeight, source: 'osm-levels' };
  }
  const compactTypes = new Set(['garage', 'garages', 'shed', 'hut', 'roof', 'carport', 'kiosk']);
  const tallTypes = new Set(['cathedral', 'church', 'civic', 'government']);
  const kind = tags.building ?? tags['building:part'] ?? '';
  return {
    heightMeters: compactTypes.has(kind) ? 3 : tallTypes.has(kind) ? 12 : 6,
    source: 'estimated',
  };
}

function cacheKey(workspace: LinkPlannerWorkspace): string {
  const sites = new Map(workspace.sites.map((site) => [site.id, site]));
  const paths = workspace.links.map((link) => {
    const a = sites.get(link.siteAId);
    const b = sites.get(link.siteBId);
    if (!a || !b) return link.id;
    return [a.location.latitude, a.location.longitude, b.location.latitude, b.location.longitude]
      .map((value) => value.toFixed(5))
      .join(':');
  }).sort();
  return `topolink:osm-buildings:v${CACHE_VERSION}:${paths.join('|')}`;
}

function readCache(key: string): CachedBuildings | undefined {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null') as CachedBuildings | null;
    if (!parsed || !Array.isArray(parsed.candidates) || !Number.isFinite(parsed.expiresAt)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, candidates: BuildingFootprintCandidate[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({
      expiresAt: Date.now() + CACHE_TTL_MILLISECONDS,
      candidates,
    } satisfies CachedBuildings));
  } catch {
    // Storage can be unavailable or full; live building analysis still works.
  }
}

function overpassQuery(workspace: LinkPlannerWorkspace): string {
  const sites = new Map(workspace.sites.map((site) => [site.id, site]));
  const statements: string[] = [];
  for (const link of workspace.links) {
    const a = sites.get(link.siteAId);
    const b = sites.get(link.siteBId);
    if (!a || !b) continue;
    const line = `${a.location.latitude},${a.location.longitude},${b.location.latitude},${b.location.longitude}`;
    statements.push(`way["building"](around:40,${line});`);
    statements.push(`way["building:part"](around:40,${line});`);
  }
  return `[out:json][timeout:25];(${statements.join('')});out tags geom qt;`;
}

function candidateFromWay(way: OverpassBuildingWay): BuildingFootprintCandidate | undefined {
  if (!way.geometry || way.geometry.length < 3) return undefined;
  const ring = way.geometry.map((point) => [point.lon, point.lat]);
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  const tags = way.tags ?? {};
  const height = osmBuildingHeight(tags);
  return {
    id: `osm-way/${way.id}`,
    name: tags.name,
    heightMeters: height.heightMeters,
    heightSource: height.source,
    geometry: { type: 'Polygon', coordinates: [ring] } satisfies Polygon,
  };
}

export async function loadOsmBuildingCandidates(
  workspace: LinkPlannerWorkspace,
  signal: AbortSignal,
): Promise<OsmBuildingLoadResult> {
  if (!workspace.links.length) return { candidates: [], status: 'ready' };
  const key = cacheKey(workspace);
  const cached = readCache(key);
  if (cached && cached.expiresAt > Date.now()) return { candidates: cached.candidates, status: 'cached' };
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ data: overpassQuery(workspace) }),
      signal,
    });
    if (!response.ok) throw new Error(`OSM building detail request failed with ${response.status}`);
    const payload = await response.json() as { elements?: OverpassBuildingWay[] };
    const candidates = (payload.elements ?? [])
      .map(candidateFromWay)
      .filter((candidate): candidate is BuildingFootprintCandidate => Boolean(candidate));
    writeCache(key, candidates);
    return { candidates, status: 'ready' };
  } catch (error) {
    if (cached && !signal.aborted) return { candidates: cached.candidates, status: 'stale' };
    throw error;
  }
}
