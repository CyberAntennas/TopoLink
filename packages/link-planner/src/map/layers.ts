export type PlannerLayerId =
  | 'terrain'
  | 'land'
  | 'water'
  | 'roads'
  | 'transit'
  | 'boundaries'
  | 'basemap-buildings'
  | 'public-wifi'
  | 'wifi-coverage'
  | 'places'
  | 'links'
  | 'devices';

export type PlannerLayerState = Record<PlannerLayerId, boolean>;

export const DEFAULT_PLANNER_LAYERS: PlannerLayerState = {
  terrain: true,
  land: true,
  water: true,
  roads: true,
  transit: true,
  boundaries: true,
  'basemap-buildings': true,
  'public-wifi': false,
  'wifi-coverage': true,
  places: true,
  links: true,
  devices: true,
};

export const PLANNER_LAYER_LABELS: ReadonlyArray<{ id: PlannerLayerId; label: string }> = [
  { id: 'terrain', label: 'Terrain' },
  { id: 'land', label: 'Land and nature' },
  { id: 'water', label: 'Water' },
  { id: 'roads', label: 'Roads' },
  { id: 'transit', label: 'Transit' },
  { id: 'boundaries', label: 'Boundaries' },
  { id: 'basemap-buildings', label: 'Basemap 3D buildings' },
  { id: 'public-wifi', label: 'OSM public Wi-Fi' },
  { id: 'wifi-coverage', label: 'Estimated Wi-Fi coverage' },
  { id: 'places', label: 'Place labels' },
  { id: 'links', label: 'RF links' },
  { id: 'devices', label: 'Towers and devices' },
];
