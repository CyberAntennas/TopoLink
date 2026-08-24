import { Box, Layers3, MapPinPlus, MousePointer2, PanelRightClose, PanelRightOpen, Waypoints } from 'lucide-react';

export type PlannerMode = 'select' | 'add-site' | 'add-link';

export interface PlannerToolbarProps {
  mode: PlannerMode;
  panelOpen: boolean;
  layerPaletteOpen: boolean;
  pendingLinkSiteName?: string;
  onModeChange(mode: PlannerMode): void;
  onPanelToggle(): void;
  onLayerPaletteToggle(): void;
  onResetCamera(): void;
}

const tools = [
  { mode: 'select', label: 'Select', Icon: MousePointer2 },
  { mode: 'add-site', label: 'Add site', Icon: MapPinPlus },
  { mode: 'add-link', label: 'Add link', Icon: Waypoints },
] as const;

export function PlannerToolbar({
  mode,
  panelOpen,
  layerPaletteOpen,
  pendingLinkSiteName,
  onModeChange,
  onPanelToggle,
  onLayerPaletteToggle,
  onResetCamera,
}: PlannerToolbarProps) {
  return (
    <div className="topolink-toolbar" aria-label="Planner tools">
      <div className="topolink-toolbar__modes">
        {tools.map(({ mode: toolMode, label, Icon }) => (
          <button
            aria-label={label}
            aria-pressed={mode === toolMode}
            className="topolink-icon-button"
            key={toolMode}
            onClick={() => onModeChange(toolMode)}
            title={label}
            type="button"
          >
            <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
          </button>
        ))}
      </div>
      {pendingLinkSiteName && <span className="topolink-toolbar__context">From {pendingLinkSiteName}</span>}
      <span className="topolink-toolbar__separator" />
      <button
        aria-label="Reset 3D view"
        className="topolink-icon-button"
        onClick={onResetCamera}
        title="Reset 3D view"
        type="button"
      >
        <Box aria-hidden="true" size={18} />
      </button>
      <button
        aria-label="Map layers"
        aria-pressed={layerPaletteOpen}
        className="topolink-icon-button"
        onClick={onLayerPaletteToggle}
        title="Map layers"
        type="button"
      >
        <Layers3 aria-hidden="true" size={18} />
      </button>
      <button
        aria-label={panelOpen ? 'Hide inspector' : 'Show inspector'}
        className="topolink-icon-button topolink-toolbar__panel-toggle"
        onClick={onPanelToggle}
        title={panelOpen ? 'Hide inspector' : 'Show inspector'}
        type="button"
      >
        {panelOpen ? <PanelRightClose aria-hidden="true" size={18} /> : <PanelRightOpen aria-hidden="true" size={18} />}
      </button>
    </div>
  );
}
