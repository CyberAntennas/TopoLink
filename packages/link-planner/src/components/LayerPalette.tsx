import { Box, Building2, Map, Mountain, RadioTower, Route, Tags, Train, Waves, Wifi } from 'lucide-react';
import { PLANNER_LAYER_LABELS, type PlannerLayerId, type PlannerLayerState } from '../map/layers';

const icons: Record<PlannerLayerId, typeof Map> = {
  terrain: Mountain,
  land: Map,
  water: Waves,
  roads: Route,
  transit: Train,
  boundaries: Box,
  'basemap-buildings': Building2,
  'public-wifi': Wifi,
  'wifi-coverage': RadioTower,
  places: Tags,
  links: Route,
  devices: RadioTower,
};

export function LayerPalette({
  layers,
  onChange,
}: {
  layers: PlannerLayerState;
  onChange(id: PlannerLayerId, visible: boolean): void;
}) {
  return (
    <div className="topolink-layer-palette" aria-label="Map layers">
      <div className="topolink-layer-palette__header">
        <span>Layers</span>
        <small>All map data</small>
      </div>
      <div className="topolink-layer-palette__list">
        {PLANNER_LAYER_LABELS.map(({ id, label }) => {
          const Icon = icons[id];
          return (
            <label className="topolink-layer-switch" key={id}>
              <Icon aria-hidden="true" size={15} />
              <span>{label}</span>
              <input
                checked={layers[id]}
                onChange={(event) => onChange(id, event.currentTarget.checked)}
                type="checkbox"
              />
              <i aria-hidden="true" />
            </label>
          );
        })}
      </div>
      <a className="topolink-layer-palette__source" href="https://www.openstreetmap.org/copyright" rel="noreferrer" target="_blank">
        Basemap buildings · OpenStreetMap
      </a>
      <a
        className="topolink-layer-palette__source"
        href="https://wiki.openstreetmap.org/wiki/Key:internet_access"
        rel="noreferrer"
        target="_blank"
      >
        Public Wi-Fi · OpenStreetMap / Overpass
      </a>
    </div>
  );
}
