import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LinkPlanner, WORKSPACE_VERSION, type LinkPlannerWorkspace } from '@cyberantennas/topo-link-planner';
import '@cyberantennas/topo-link-planner/styles.css';
import './preview.css';

const workspace: LinkPlannerWorkspace = {
  version: WORKSPACE_VERSION,
  id: 'workspace-florence-preview',
  name: 'Florence rooftop backhaul',
  sites: [
    {
      id: 'site-duomo',
      name: 'Duomo relay',
      location: { latitude: 43.7731, longitude: 11.256, elevationMeters: 54 },
      antennaHeightMeters: 22,
      mounting: { surface: 'rooftop', buildingHeightMeters: 34 },
      device: { productId: 'A20', azimuthDegrees: 206, tiltDegrees: -1 },
    },
    {
      id: 'site-boboli',
      name: 'Boboli uplink',
      location: { latitude: 43.7629, longitude: 11.2495, elevationMeters: 78 },
      antennaHeightMeters: 18,
      mounting: { surface: 'rooftop', buildingHeightMeters: 15 },
      device: { productId: '09M-DISH-HP', azimuthDegrees: 26, tiltDegrees: 1 },
    },
  ],
  links: [
    {
      id: 'link-florence-primary',
      name: 'Florence primary',
      siteAId: 'site-duomo',
      siteBId: 'site-boboli',
      radio: {
        frequencyMHz: 5_800,
        channelWidthMHz: 40,
        transmitPowerDbm: 27,
        antennaGainDbi: 24,
        systemLossDb: 2,
      },
    },
  ],
  settings: { fresnelClearanceRatio: 0.6, earthCurvatureKFactor: 4 / 3 },
};

function Preview() {
  return (
    <main>
      <LinkPlanner
        initialWorkspace={workspace}
        mapDataUrl="https://pmtiles.io/protomaps(vector)ODbL_firenze.pmtiles"
        onError={(error) => console.error('TopoLink planner:', error)}
        onWorkspaceChange={(serializedWorkspace) => localStorage.setItem('topolink-preview', serializedWorkspace)}
        terrainDataUrl="https://tiles.mapterhorn.com/tilejson.json"
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
