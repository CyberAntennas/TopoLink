# Dependency status

Audit date: 2026-08-24

## JavaScript

- Node.js `26.5.0` and npm `11.17.0` satisfy the workspace engine requirements.
- React 19, MapLibre GL 6, PMTiles 4, Three.js 0.185, Vite 8, Vitest 4, and TypeScript 7 resolve without peer dependency conflicts.
- ArcGIS I3S, DeckGL, and loaders.gl were removed. PMTiles basemap buildings drive rendering and immediate fallback analysis; locally cached OSM building details supply explicit or level-derived heights along active links.
- `npm audit` reports zero vulnerabilities after pruning the I3S dependency chain.
- `npm run deps:check`, strict type checking, 32 unit tests, ESM/CJS builds, a CommonJS import smoke test, and an npm tarball dry run pass.
- Two serialized Playwright browser tests cover the built package at desktop and mobile viewports, including full-viewport sizing, default layer state, height-aware obstruction fixtures, 3D obstacle cuts, selected-site camera framing, Three.js tower/Fresnel creation, the 24-product catalog, worker-backed RF analysis, terrain-profile rendering, screenshot capture, and pixel variance.
- MapLibre and PMTiles are loaded lazily because MapLibre 6 is ESM-only. The project-owned calculation worker remains inlined in both package entry points.
- RF calculations run in an inline JavaScript Web Worker and require no WebAssembly or native toolchain.
- Cyber Antennas product images are emitted as separate package assets rather than inlined into the JavaScript entry.
