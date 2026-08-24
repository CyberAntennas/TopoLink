import { Building2, Check, Crosshair, Link2, MapPinPlus, Minus } from 'lucide-react';
import type { PlannerMapContextRequest } from '../map/mountPlannerMap';

export interface PlannerContextMenuProps {
  request: PlannerMapContextRequest;
  selectedSiteIds: readonly string[];
  onAutoAlign(): void;
  onCreateLink(): void;
  onPlaceSite(): void;
  onToggleSite(): void;
}

export function PlannerContextMenu({
  request,
  selectedSiteIds,
  onAutoAlign,
  onCreateLink,
  onPlaceSite,
  onToggleSite,
}: PlannerContextMenuProps) {
  const siteSelected = Boolean(request.siteId && selectedSiteIds.includes(request.siteId));
  const label = request.siteId
    ? 'Site actions'
    : request.linkId
      ? 'Link actions'
      : request.point.building?.name ?? (request.point.building ? 'Building actions' : 'Map actions');

  return (
    <div
      aria-label={label}
      className="topolink-context-menu"
      role="menu"
      style={{ left: request.x, top: request.y }}
    >
      <header>{label}</header>
      {request.siteId && (
        <button onClick={onToggleSite} role="menuitem" type="button">
          {siteSelected ? <Minus aria-hidden="true" size={15} /> : <Check aria-hidden="true" size={15} />}
          {siteSelected ? 'Remove from selection' : 'Select site'}
        </button>
      )}
      {!request.siteId && !request.linkId && (
        <button onClick={onPlaceSite} role="menuitem" type="button">
          {request.point.building ? <Building2 aria-hidden="true" size={15} /> : <MapPinPlus aria-hidden="true" size={15} />}
          {request.point.building ? 'Place rooftop site' : 'Place ground site'}
        </button>
      )}
      {selectedSiteIds.length === 2 && !request.linkId && (
        <button onClick={onCreateLink} role="menuitem" type="button">
          <Link2 aria-hidden="true" size={15} /> Create link
        </button>
      )}
      {request.linkId && (
        <button onClick={onAutoAlign} role="menuitem" type="button">
          <Crosshair aria-hidden="true" size={15} /> Auto-align antennas
        </button>
      )}
    </div>
  );
}
