# TopoLink

TopoLink is an embeddable browser component for planning point-to-point RF links over PMTiles map and Terrain-RGB data. It combines MapLibre terrain and vector layers, Esri's OpenStreetMap 3D Buildings scene layer, and a Three.js tower/device renderer. RF calculations stay in an inline JavaScript worker; the project contains no WebAssembly build or runtime dependency.

## Workspace

```text
apps/demo/              Full-viewport interactive preview
packages/link-planner/  React package, map adapters, Three.js layer, product catalog, domain model, worker, tests
fixtures/               Versioned sample workspaces for integration tests and demos
scripts/                Local dependency diagnostics
PLAN.md                 Product and packaging direction supplied for the project
```

## Requirements

- Node.js 22.12 or newer and npm 10 or newer

Run the JavaScript validation gates with:

```sh
npm install
npm run deps:check
npm run check
```

The current local audit is recorded in [`docs/dependency-status.md`](docs/dependency-status.md).

Start the interactive component preview with:

```sh
npm run build
npm run dev
```

The preview consumes the built package through its public exports and uses public PMTiles and terrain demo services, so it requires network access. Run `npm run test:e2e` after installing the Playwright Chromium runtime to exercise it at desktop and mobile viewports.

## Package use

```tsx
import { LinkPlanner, casablancaDemoWorkspace } from '@cyberantennas/topo-link-planner';
import '@cyberantennas/topo-link-planner/styles.css';

export function PlannerPage() {
  return (
    <div style={{ width: '100vw', height: '100dvh' }}>
      <LinkPlanner
        mapDataUrl="/maps/casablanca.pmtiles"
        terrainDataUrl="/terrain/{z}/{x}/{y}.png"
        initialWorkspace={casablancaDemoWorkspace}
      />
    </div>
  );
}
```

The current default codec is explicitly prefixed `topolink-json-v1:` Base64. It is a development format, not Protobuf. `WorkspaceCodec` is injectable so a generated Protobuf codec can replace it without changing the component API.

The component fills the dimensions of its parent, so every ancestor up to the intended layout boundary must have a definite width and height. The toolbar exposes terrain, basemap 3D buildings, RF links, coverage, and device layers. Selecting a site opens rooftop/ground mounting, one-meter roof-height sections, tower height, azimuth, tilt, and the 24-item Cyber Antennas product picker. Product images are emitted as package assets and are processed into centered, transparent Three.js device skins at runtime.

Selecting a link samples a 96-point terrain path. The inline JavaScript worker calculates free-space loss, estimated receive power, effective-earth curvature, line of sight, and required Fresnel clearance using transferable typed arrays. Results appear in the terrain profile while Three.js renders the matching clearance volume on the map.

The public demo requires access to the configured PMTiles, terrain tiles, glyph service, packaged product assets, and optional OpenStreetMap building details from Overpass. PMTiles buildings drive the basemap extrusion and provide the immediate offline fallback. Along active links, the planner caches detailed OSM footprints and height tags in localStorage, prefers explicit `height`, derives `building:levels` at 3 m per level, labels estimates, samples local terrain, and only classifies buildings that penetrate the configured Fresnel clearance as obstacles.

## Next integration gates

1. Define the Protobuf schema and replace the development workspace codec.
2. Add interactive tower/Fresnel drag handles to the existing Three.js custom layer.
3. Add licensed, deterministic PMTiles and Terrain-RGB fixtures for offline browser tests.
4. Expand manufacturer-verified azimuth/elevation gain patterns and receiver sensitivity profiles.
