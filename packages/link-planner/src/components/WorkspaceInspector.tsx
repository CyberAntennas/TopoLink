import { Building2, Crosshair, ExternalLink, LandPlot, MapPinPlus, RadioTower, Route, Trash2, TriangleAlert, Wifi } from 'lucide-react';
import type { LinkPlannerWorkspace, RadioLink, Site } from '../domain/types';
import {
  calculateLinkBudget,
  calculateOptimalLinkAlignment,
  haversineDistanceMeters,
  type LinkBudgetResult,
  type OptimalLinkAlignment,
  type TerrainProfileResult,
  type WifiInterferenceAssessment,
} from '../engine/rfMath';
import type { MapPlacement } from '../map/mountPlannerMap';
import { antennaBeamPattern } from '../map/rfVisualization';
import type { BuildingLinkObstacle } from '../map/buildingObstacles';
import { CYBER_ANTENNAS_PRODUCTS, getCyberAntennaProduct } from '../products/cyberAntennasCatalog';

export type PlannerSelection =
  | { kind: 'site' | 'link'; id: string }
  | { kind: 'building'; point: MapPlacement & { building: NonNullable<MapPlacement['building']> } }
  | { kind: 'obstacle'; obstacle: BuildingLinkObstacle }
  | null;

export interface SelectedLinkAnalysis {
  linkId: string;
  budget: LinkBudgetResult;
  buildingLossDb: number;
  obstructingBuildingCount: number;
  profile: TerrainProfileResult;
  alignment: OptimalLinkAlignment;
  interference: WifiInterferenceAssessment;
}

export interface WorkspaceInspectorProps {
  workspace: LinkPlannerWorkspace;
  selection: PlannerSelection;
  onSelectionChange(selection: PlannerSelection): void;
  onSiteSelection(siteId: string, multi: boolean): void;
  onSiteChange(site: Site): void;
  onLinkChange(link: RadioLink): void;
  onDeleteSelection(): void;
  onPlaceBuildingSite(point: MapPlacement): void;
  onAutoAlignLink(linkId: string): void;
  selectedSiteIds: readonly string[];
  linkAnalysis?: SelectedLinkAnalysis;
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 'any',
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number | 'any';
  onChange(value: number): void;
}) {
  return (
    <label className="topolink-field">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (!Number.isFinite(next)) return;
          if (min !== undefined && next < min) return;
          if (max !== undefined && next > max) return;
          onChange(next);
        }}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

function antennaElevation(site: Site): number {
  return site.location.elevationMeters +
    (site.mounting?.surface === 'rooftop' ? site.mounting.buildingHeightMeters : 0) +
    site.antennaHeightMeters + 0.9;
}

function SiteEditor({ site, workspace, onChange }: { site: Site; workspace: LinkPlannerWorkspace; onChange(site: Site): void }) {
  const mounting = site.mounting ?? { surface: 'ground' as const, buildingHeightMeters: 0 };
  const device = site.device ?? { productId: 'S30', azimuthDegrees: 0, tiltDegrees: 0 };
  const selectedProduct = getCyberAntennaProduct(device.productId);
  const categories = [...new Set(CYBER_ANTENNAS_PRODUCTS.map((product) => product.category))];
  const connectedLink = workspace.links.find((link) => link.siteAId === site.id || link.siteBId === site.id);
  const otherSite = workspace.sites.find((candidate) =>
    candidate.id === (connectedLink?.siteAId === site.id ? connectedLink.siteBId : connectedLink?.siteAId),
  );
  const alignment = connectedLink && otherSite
    ? calculateOptimalLinkAlignment(site.location, antennaElevation(site), otherSite.location, antennaElevation(otherSite))
    : undefined;
  const beamPattern = connectedLink ? antennaBeamPattern(selectedProduct, connectedLink.radio.frequencyMHz) : undefined;
  return (
    <div className="topolink-inspector__editor">
      <label className="topolink-field topolink-field--wide">
        <span>Name</span>
        <input onChange={(event) => onChange({ ...site, name: event.currentTarget.value })} value={site.name} />
      </label>
      <NumberField
        label="Latitude"
        max={90}
        min={-90}
        onChange={(latitude) => onChange({ ...site, location: { ...site.location, latitude } })}
        value={site.location.latitude}
      />
      <NumberField
        label="Longitude"
        max={180}
        min={-180}
        onChange={(longitude) => onChange({ ...site, location: { ...site.location, longitude } })}
        value={site.location.longitude}
      />
      <NumberField
        label="Ground elevation (m)"
        onChange={(elevationMeters) => onChange({ ...site, location: { ...site.location, elevationMeters } })}
        value={site.location.elevationMeters}
      />
      <fieldset className="topolink-segmented topolink-field--wide">
        <legend>Mount surface</legend>
        <button
          aria-pressed={mounting.surface === 'ground'}
          onClick={() => onChange({ ...site, mounting: { ...mounting, surface: 'ground', buildingHeightMeters: 0 } })}
          type="button"
        >
          <LandPlot aria-hidden="true" size={14} /> Ground
        </button>
        <button
          aria-pressed={mounting.surface === 'rooftop'}
          onClick={() => onChange({ ...site, mounting: { ...mounting, surface: 'rooftop', buildingHeightMeters: Math.max(1, mounting.buildingHeightMeters) } })}
          type="button"
        >
          <Building2 aria-hidden="true" size={14} /> Rooftop
        </button>
        <button
          aria-pressed={mounting.surface === 'tower'}
          onClick={() => onChange({ ...site, mounting: { ...mounting, surface: 'tower', buildingHeightMeters: 0 } })}
          type="button"
        >
          <RadioTower aria-hidden="true" size={14} /> Tower
        </button>
      </fieldset>
      {mounting.surface === 'rooftop' && (
        <label className="topolink-field topolink-field--wide topolink-range-field">
          <span>Building roof height <strong>{mounting.buildingHeightMeters} m</strong></span>
          <input
            aria-label="Building roof height (m)"
            max={250}
            min={1}
            onChange={(event) => onChange({ ...site, mounting: { ...mounting, buildingHeightMeters: event.currentTarget.valueAsNumber } })}
            step={1}
            type="range"
            value={mounting.buildingHeightMeters}
          />
          <small>1 meter sections</small>
        </label>
      )}
      <label className="topolink-field topolink-field--wide topolink-range-field">
        <span>{mounting.surface === 'ground' ? 'Device height' : 'Tower height'} <strong>{site.antennaHeightMeters} m</strong></span>
        <input
          aria-label={mounting.surface === 'ground' ? 'Device height (m)' : 'Tower height (m)'}
          max={120}
          min={1}
          onChange={(event) => onChange({ ...site, antennaHeightMeters: event.currentTarget.valueAsNumber })}
          step={1}
          type="range"
          value={site.antennaHeightMeters}
        />
        <small>1 meter structural sections; the model grows from its base</small>
      </label>
      <NumberField
        label="Azimuth (°)"
        max={359}
        min={0}
        step={0.1}
        onChange={(azimuthDegrees) => onChange({ ...site, device: { ...device, azimuthDegrees } })}
        value={device.azimuthDegrees}
      />
      <NumberField
        label="Tilt (°)"
        max={45}
        min={-45}
        step={0.1}
        onChange={(tiltDegrees) => onChange({ ...site, device: { ...device, tiltDegrees } })}
        value={device.tiltDegrees}
      />
      <label className="topolink-field topolink-field--wide">
        <span>Installed Cyber Antennas product</span>
        <select
          aria-label="Installed Cyber Antennas product"
          onChange={(event) => onChange({ ...site, device: { ...device, productId: event.currentTarget.value } })}
          value={selectedProduct.id}
        >
          {categories.map((category) => (
            <optgroup key={category} label={category}>
              {CYBER_ANTENNAS_PRODUCTS.filter((product) => product.category === category).map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <a className="topolink-product-preview topolink-field--wide" href={selectedProduct.productUrl} rel="noreferrer" target="_blank">
        <img alt={selectedProduct.name} src={selectedProduct.imageUrl} />
        <span><strong>{selectedProduct.name}</strong><small>{selectedProduct.category} · {selectedProduct.id}</small></span>
        <ExternalLink aria-hidden="true" size={15} />
      </a>
      <div className="topolink-device-toolkit topolink-field--wide">
        <header><Crosshair aria-hidden="true" size={15} /><strong>Alignment and technical details</strong></header>
        <div><span>Geometry</span><strong>{selectedProduct.formFactor}</strong></div>
        <div><span>Size</span><strong>{selectedProduct.diameterMeters ? `${selectedProduct.diameterMeters} m diameter` : selectedProduct.category}</strong></div>
        <div><span>Installed direction</span><strong>{device.azimuthDegrees.toFixed(1)}°</strong></div>
        <div><span>Installed tilt</span><strong>{device.tiltDegrees.toFixed(2)}°</strong></div>
        {connectedLink && <div><span>Link radio</span><strong>{connectedLink.radio.frequencyMHz} MHz · {connectedLink.radio.channelWidthMHz} MHz</strong></div>}
        {beamPattern && <div><span>Azimuth beamwidth</span><strong>{beamPattern.azimuthDegrees.toFixed(1)}° at -{beamPattern.referenceDb} dB</strong></div>}
        {beamPattern && <div><span>Elevation beamwidth</span><strong>{beamPattern.elevationDegrees.toFixed(1)}° at -{beamPattern.referenceDb} dB</strong></div>}
        {beamPattern && <div><span>Pattern source</span><strong>{beamPattern.source.replaceAll('-', ' ')}</strong></div>}
        {alignment && otherSite && (
          <>
            <div><span>Target: {otherSite.name}</span><strong>{alignment.siteAAzimuthDegrees.toFixed(1)}° · {alignment.siteATiltDegrees.toFixed(2)}° tilt</strong></div>
            <button
              className="topolink-command-button"
              onClick={() => onChange({ ...site, device: { ...device, azimuthDegrees: Number(alignment.siteAAzimuthDegrees.toFixed(1)), tiltDegrees: Number(alignment.siteATiltDegrees.toFixed(2)) } })}
              type="button"
            >
              <Crosshair aria-hidden="true" size={15} /> Align antenna to link
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function LinkEditor({
  link,
  workspace,
  onChange,
  onAutoAlign,
  analysis,
}: {
  link: RadioLink;
  workspace: LinkPlannerWorkspace;
  onChange(link: RadioLink): void;
  onAutoAlign(): void;
  analysis?: SelectedLinkAnalysis;
}) {
  const siteA = workspace.sites.find((site) => site.id === link.siteAId);
  const siteB = workspace.sites.find((site) => site.id === link.siteBId);
  const fallbackDistance = siteA && siteB ? haversineDistanceMeters(siteA.location, siteB.location) : 1;
  const budget = analysis?.budget ?? calculateLinkBudget(link.radio, fallbackDistance);
  const updateRadio = (field: keyof RadioLink['radio'], value: number) =>
    onChange({ ...link, radio: { ...link.radio, [field]: value } });

  return (
    <div className="topolink-inspector__editor">
      <label className="topolink-field topolink-field--wide">
        <span>Name</span>
        <input onChange={(event) => onChange({ ...link, name: event.currentTarget.value })} value={link.name} />
      </label>
      <div className="topolink-link-metrics topolink-field--wide">
        <div><span>Distance</span><strong>{(budget.distanceMeters / 1_000).toFixed(2)} km</strong></div>
        <div><span>Path loss</span><strong>{budget.freeSpacePathLossDb.toFixed(1)} dB</strong></div>
        <div><span>Estimated RX</span><strong>{budget.receivedPowerDbm.toFixed(1)} dBm</strong></div>
        <div><span>Fresnel radius</span><strong>{budget.maximumFresnelRadiusMeters.toFixed(1)} m</strong></div>
        <div><span>Free-space range</span><strong>{(budget.maximumFreeSpaceRangeMeters / 1_000).toFixed(1)} km</strong></div>
        <div><span>Link margin</span><strong>{budget.linkMarginDb.toFixed(1)} dB</strong></div>
        <div><span>Building loss</span><strong>{analysis ? `${analysis.buildingLossDb.toFixed(1)} dB · ${analysis.obstructingBuildingCount} obstacle${analysis.obstructingBuildingCount === 1 ? '' : 's'}` : 'Pending'}</strong></div>
      </div>
      {analysis && (
        <div className="topolink-alignment topolink-field--wide">
          <header><Crosshair aria-hidden="true" size={15} /><strong>Optimal alignment</strong></header>
          <div>
            <span>{siteA?.name ?? 'Site A'}</span>
            <strong>{analysis.alignment.siteAAzimuthDegrees.toFixed(1)}°</strong>
            <small>{analysis.alignment.siteATiltDegrees.toFixed(2)}° tilt</small>
          </div>
          <div>
            <span>{siteB?.name ?? 'Site B'}</span>
            <strong>{analysis.alignment.siteBAzimuthDegrees.toFixed(1)}°</strong>
            <small>{analysis.alignment.siteBTiltDegrees.toFixed(2)}° tilt</small>
          </div>
          <button className="topolink-command-button" onClick={onAutoAlign} type="button">
            <Crosshair aria-hidden="true" size={15} /> Auto-align antennas
          </button>
        </div>
      )}
      {analysis && (
        <div className="topolink-recommendation topolink-field--wide">
          <Wifi aria-hidden="true" size={15} />
          <span><strong>{analysis.interference.recommendedBandMHz / 1_000} GHz recommended</strong><small>{analysis.interference.nearbyHotspotCount} nearby public hotspots · {analysis.interference.risk} best-band risk</small></span>
        </div>
      )}
      {analysis && <TerrainProfileChart analysis={analysis} />}
      <NumberField label="Frequency (MHz)" min={1} onChange={(value) => updateRadio('frequencyMHz', value)} value={link.radio.frequencyMHz} />
      <NumberField label="Channel width (MHz)" min={1} onChange={(value) => updateRadio('channelWidthMHz', value)} value={link.radio.channelWidthMHz} />
      <NumberField label="TX power (dBm)" onChange={(value) => updateRadio('transmitPowerDbm', value)} value={link.radio.transmitPowerDbm} />
      <NumberField label="Antenna gain (dBi)" onChange={(value) => updateRadio('antennaGainDbi', value)} value={link.radio.antennaGainDbi} />
      <NumberField label="System loss (dB)" min={0} onChange={(value) => updateRadio('systemLossDb', value)} value={link.radio.systemLossDb} />
      <NumberField label="Target RX threshold (dBm)" max={-1} onChange={(value) => updateRadio('receiverSensitivityDbm', value)} value={link.radio.receiverSensitivityDbm ?? -75} />
    </div>
  );
}

function TerrainProfileChart({ analysis }: { analysis: SelectedLinkAnalysis }) {
  const profile = analysis.profile;
  const width = 320;
  const height = 104;
  const padding = 7;
  const values = [
    ...profile.terrainElevationsMeters,
    ...profile.lineOfSightElevationsMeters,
  ];
  const minimum = Math.min(...values) - 2;
  const maximum = Math.max(...values) + analysis.budget.maximumFresnelRadiusMeters + 2;
  const totalDistance = profile.distancesMeters[profile.distancesMeters.length - 1] ?? 1;
  const point = (distance: number, elevation: number) => {
    const x = padding + (distance / totalDistance) * (width - padding * 2);
    const y = height - padding - ((elevation - minimum) / Math.max(1, maximum - minimum)) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const terrainPoints = Array.from(profile.distancesMeters, (distance, index) =>
    point(distance, profile.terrainElevationsMeters[index]!),
  );
  const lineOfSightPoints = Array.from(profile.distancesMeters, (distance, index) =>
    point(distance, profile.lineOfSightElevationsMeters[index]!),
  );
  const fresnelUpper = Array.from(profile.distancesMeters, (distance, index) =>
    point(distance, profile.lineOfSightElevationsMeters[index]! + profile.fresnelRadiiMeters[index]!),
  );
  const fresnelLower = Array.from(profile.distancesMeters, (distance, index) =>
    point(distance, profile.lineOfSightElevationsMeters[index]! - profile.fresnelRadiiMeters[index]!),
  ).reverse();
  const terrainPath = `M${padding},${height - padding} L${terrainPoints.join(' L')} L${width - padding},${height - padding} Z`;
  const fresnelPath = `M${fresnelUpper.join(' L')} L${fresnelLower.join(' L')} Z`;

  return (
    <div className="topolink-profile topolink-field--wide">
      <header>
        <span>Terrain profile</span>
        <strong data-clear={profile.clear}>
          {profile.clear ? 'Clear' : 'Obstructed'} · {profile.minimumClearanceMeters.toFixed(1)} m
        </strong>
      </header>
      <svg aria-label="Terrain and Fresnel clearance profile" role="img" viewBox={`0 0 ${width} ${height}`}>
        <path className="topolink-profile__fresnel" d={fresnelPath} />
        <path className="topolink-profile__terrain" d={terrainPath} />
        <polyline className="topolink-profile__los" points={lineOfSightPoints.join(' ')} />
      </svg>
    </div>
  );
}

function BuildingEditor({ point, onPlaceSite }: { point: MapPlacement; onPlaceSite(): void }) {
  if (!point.building) return null;
  return (
    <div className="topolink-building-details">
      <div><span>Roof height</span><strong>{point.building.heightMeters} m</strong></div>
      <div><span>Data source</span><strong>{point.building.source === 'osm-detail' ? 'OpenStreetMap building detail' : 'Basemap OpenStreetMap'}</strong></div>
      <div><span>Latitude</span><strong>{point.latitude.toFixed(6)}</strong></div>
      <div><span>Longitude</span><strong>{point.longitude.toFixed(6)}</strong></div>
      <button className="topolink-command-button" onClick={onPlaceSite} type="button">
        <MapPinPlus aria-hidden="true" size={15} /> Place site on roof
      </button>
    </div>
  );
}

function ObstacleEditor({ obstacle }: { obstacle: BuildingLinkObstacle }) {
  const obstructed = obstacle.fresnelClearanceMeters < 0;
  const heightSource = obstacle.heightSource === 'osm-height'
    ? 'OSM explicit height'
    : obstacle.heightSource === 'osm-levels'
      ? 'OSM levels × 3 m'
      : obstacle.heightSource === 'basemap-height'
        ? 'Basemap height'
        : 'Estimated height';
  return (
    <div className="topolink-obstacle-details">
      <header data-obstructed={obstructed}><TriangleAlert aria-hidden="true" size={16} /><strong>{obstructed ? 'Path obstructed' : 'Path clears roof'}</strong></header>
      <div><span>Building</span><strong>{obstacle.name}</strong></div>
      <div><span>Building height</span><strong>{obstacle.heightMeters.toFixed(1)} m · {heightSource}</strong></div>
      <div><span>Distance from site A</span><strong>{(obstacle.distanceFromSiteAMeters / 1_000).toFixed(2)} km</strong></div>
      <div><span>Line-of-sight clearance</span><strong>{obstacle.verticalClearanceMeters.toFixed(1)} m</strong></div>
      <div><span>Required Fresnel radius</span><strong>{obstacle.requiredFresnelRadiusMeters.toFixed(1)} m</strong></div>
      <div><span>Fresnel clearance</span><strong>{obstacle.fresnelClearanceMeters.toFixed(1)} m</strong></div>
      <div><span>Estimated diffraction loss</span><strong>{obstacle.estimatedDiffractionLossDb.toFixed(1)} dB</strong></div>
      <div><span>Roof / path elevation</span><strong>{obstacle.roofElevationMeters.toFixed(1)} / {obstacle.pathElevationMeters.toFixed(1)} m</strong></div>
    </div>
  );
}

export function WorkspaceInspector({
  workspace,
  selection,
  onSelectionChange,
  onSiteSelection,
  onSiteChange,
  onLinkChange,
  onDeleteSelection,
  onPlaceBuildingSite,
  onAutoAlignLink,
  selectedSiteIds,
  linkAnalysis,
}: WorkspaceInspectorProps) {
  const selectedSite = selection?.kind === 'site' ? workspace.sites.find((site) => site.id === selection.id) : undefined;
  const selectedLink = selection?.kind === 'link' ? workspace.links.find((link) => link.id === selection.id) : undefined;
  const selectedBuilding = selection?.kind === 'building' ? selection.point : undefined;
  const selectedObstacle = selection?.kind === 'obstacle' ? selection.obstacle : undefined;

  return (
    <aside className="topolink-inspector" aria-label="Workspace inspector">
      <header className="topolink-inspector__header">
        <span>TopoLink</span>
        <h2>{workspace.name}</h2>
      </header>
      <section className="topolink-inspector__section">
        <div className="topolink-inspector__section-title"><RadioTower size={16} /><h3>Sites</h3><span>{workspace.sites.length}</span></div>
        <div className="topolink-inspector__list">
          {workspace.sites.map((site) => (
            <button
              aria-current={selection?.kind === 'site' && selection.id === site.id}
              aria-pressed={selectedSiteIds.includes(site.id)}
              key={site.id}
              onClick={(event) => onSiteSelection(site.id, event.shiftKey)}
              type="button"
            >
              <span>{site.name}</span><small>{site.mounting?.surface === 'rooftop' ? `${site.mounting.buildingHeightMeters} m roof` : site.mounting?.surface === 'tower' ? `${site.antennaHeightMeters} m tower` : `${site.antennaHeightMeters} m high`}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="topolink-inspector__section">
        <div className="topolink-inspector__section-title"><Route size={16} /><h3>Links</h3><span>{workspace.links.length}</span></div>
        <div className="topolink-inspector__list">
          {workspace.links.map((link) => (
            <button
              aria-current={selection?.kind === 'link' && selection.id === link.id}
              key={link.id}
              onClick={() => onSelectionChange({ kind: 'link', id: link.id })}
              type="button"
            >
              <span>{link.name}</span><small>{link.radio.frequencyMHz} MHz</small>
            </button>
          ))}
        </div>
      </section>
      {(selectedSite || selectedLink || selectedBuilding || selectedObstacle) && (
        <section className="topolink-inspector__section topolink-inspector__details">
          <div className="topolink-inspector__section-title">
            <h3>{selectedSite ? 'Site details' : selectedLink ? 'Link details' : selectedObstacle ? 'Obstacle effect' : 'Building details'}</h3>
            {(selectedSite || selectedLink) && (
              <button aria-label="Delete selection" className="topolink-delete-button" onClick={onDeleteSelection} title="Delete selection" type="button">
                <Trash2 aria-hidden="true" size={16} />
              </button>
            )}
          </div>
          {selectedSite && <SiteEditor onChange={onSiteChange} site={selectedSite} workspace={workspace} />}
          {selectedLink && <LinkEditor analysis={linkAnalysis?.linkId === selectedLink.id ? linkAnalysis : undefined} link={selectedLink} onAutoAlign={() => onAutoAlignLink(selectedLink.id)} onChange={onLinkChange} workspace={workspace} />}
          {selectedBuilding && <BuildingEditor onPlaceSite={() => onPlaceBuildingSite(selectedBuilding)} point={selectedBuilding} />}
          {selectedObstacle && <ObstacleEditor obstacle={selectedObstacle} />}
        </section>
      )}
    </aside>
  );
}
