import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  Download,
  Eraser,
  Eye,
  Hash,
  Layers,
  MapPinPlus,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Pin,
  Redo2,
  RotateCcw,
  Route,
  SlidersHorizontal,
  Table2,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {
  AdminOverlayState,
  Airport,
  NetworkDiffSummary,
  RouteSector,
  SANDBOX_COLOR_PRESETS,
  SandboxTool,
} from '../types/network';
import { formatCityName } from '../utils/networkUtils';

const ROUTE_TYPE_PRESETS = ['Proposed', 'Scheduled', 'Seasonal', 'Charter', 'Cargo'] as const;

interface SandboxBarProps {
  active: boolean;
  collapsed: boolean;
  tool: SandboxTool;
  pendingOrigin: Airport | null;
  routeColor: string;
  defaultAircraft: string;
  defaultRouteType: string;
  bidirectionalDraw: boolean;
  pinOriginDraw: boolean;
  availableAircraft: string[];
  airports: Airport[];
  routes: RouteSector[];
  diff: NetworkDiffSummary;
  overlays: AdminOverlayState;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  firebaseReady: boolean;
  onToggleCollapse: () => void;
  onChangeTool: (tool: SandboxTool) => void;
  onCancelPendingOrigin: () => void;
  onChangeColor: (color: string) => void;
  onChangeDefaultAircraft: (aircraft: string) => void;
  onChangeDefaultRouteType: (routeType: string) => void;
  onToggleBidirectionalDraw: () => void;
  onTogglePinOriginDraw: () => void;
  onToggleOverlay: (key: keyof AdminOverlayState) => void;
  onUndo: () => void;
  onRedo: () => void;
  onImportFile: (file: File) => void;
  onExport: () => void;
  onOpenInEditor: () => void;
  onClearRoutes: () => void;
  onResetToLive: () => void;
  onFocusAirport: (airport: Airport) => void;
  onInspectRoute: (route: RouteSector) => void;
  onOpenPublish: () => void;
  onExit: () => void;
}

export function SandboxBar({
  active,
  collapsed,
  tool,
  pendingOrigin,
  routeColor,
  defaultAircraft,
  defaultRouteType,
  bidirectionalDraw,
  pinOriginDraw,
  availableAircraft,
  airports,
  routes,
  diff,
  overlays,
  canUndo,
  canRedo,
  undoCount,
  redoCount,
  firebaseReady,
  onToggleCollapse,
  onChangeTool,
  onCancelPendingOrigin,
  onChangeColor,
  onChangeDefaultAircraft,
  onChangeDefaultRouteType,
  onToggleBidirectionalDraw,
  onTogglePinOriginDraw,
  onToggleOverlay,
  onUndo,
  onRedo,
  onImportFile,
  onExport,
  onOpenInEditor,
  onClearRoutes,
  onResetToLive,
  onFocusAirport,
  onInspectRoute,
  onOpenPublish,
  onExit,
}: SandboxBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [changesExpanded, setChangesExpanded] = useState(false);

  const aircraftSuggestions = useMemo(() => {
    const base = ['A320neo', 'A321neo', 'A350-900', 'B737-800', 'B787-9', 'B777-300ER'];
    return [...new Set([...availableAircraft, ...base])].slice(0, 14);
  }, [availableAircraft]);

  if (!active) return null;

  const tools = [
    {
      id: 'draw' as const,
      label: 'Draw route',
      shortcut: 'D',
      hint: 'Click airport A, then B',
      icon: PenTool,
    },
    {
      id: 'select' as const,
      label: 'Select & edit',
      shortcut: 'E',
      hint: 'Inspect or modify items',
      icon: MousePointer2,
    },
    {
      id: 'add-airport' as const,
      label: 'Add airport',
      shortcut: 'A',
      hint: 'Click map to place pin',
      icon: MapPinPlus,
    },
    {
      id: 'erase' as const,
      label: 'Erase',
      shortcut: 'X',
      hint: 'Click route or station',
      icon: Eraser,
    },
  ];

  const diffParts = [
    diff.airportsAdded.length ? `+${diff.airportsAdded.length} airport` : '',
    diff.airportsModified.length ? `~${diff.airportsModified.length} airport` : '',
    diff.airportsRemoved.length ? `-${diff.airportsRemoved.length} airport` : '',
    diff.routesAdded.length ? `+${diff.routesAdded.length} route` : '',
    diff.routesModified.length ? `~${diff.routesModified.length} route` : '',
    diff.routesRemoved.length ? `-${diff.routesRemoved.length} route` : '',
  ].filter(Boolean);

  const hiddenFileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".json,application/json"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onImportFile(file);
        e.target.value = '';
      }}
    />
  );

  // Collapsed slim vertical icon rail on the left edge
  if (collapsed) {
    return (
      <>
        {hiddenFileInput}
        <aside
          aria-label="Edit Mode tool rail"
          className="fixed top-13 bottom-0 left-0 z-30 flex w-[52px] flex-col items-center justify-between border-r border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-sm py-2.5"
        >
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Expand Edit Mode menu"
              aria-label="Expand Edit Mode menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-alt)] text-[var(--ink)] hover:bg-[var(--border)]/40 transition-colors"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>

            <div className="my-1 h-px w-6 bg-[var(--border)]" />

            {tools.map(({ id, label, shortcut, icon: Icon }) => {
              const selected = tool === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChangeTool(id)}
                  title={`${label} (${shortcut})`}
                  aria-label={label}
                  aria-pressed={selected}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded transition-colors ${
                    selected
                      ? 'bg-amber-600 text-white'
                      : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}

            <div className="my-1 h-px w-6 bg-[var(--border)]" />

            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title={`Undo (Ctrl+Z)${undoCount ? ` · ${undoCount}` : ''}`}
              aria-label="Undo"
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)] disabled:opacity-35"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title={`Redo (Ctrl+Shift+Z)${redoCount ? ` · ${redoCount}` : ''}`}
              aria-label="Redo"
              className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)] disabled:opacity-35"
            >
              <Redo2 className="h-4 w-4" />
            </button>

            <div className="my-1 h-px w-6 bg-[var(--border)]" />

            <button
              type="button"
              onClick={() => onToggleOverlay('showLiveRoutes')}
              aria-pressed={overlays.showLiveRoutes}
              title="Toggle Live Routes Overlay"
              aria-label="Toggle Live Routes Overlay"
              className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
                overlays.showLiveRoutes
                  ? 'bg-red-500/10 text-[#EE1C25]'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)]'
              }`}
            >
              <Layers className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleOverlay('showAirportCounts')}
              aria-pressed={overlays.showAirportCounts}
              title="Toggle Airport Route Counts"
              aria-label="Toggle Airport Route Counts"
              className={`inline-flex h-8 w-8 items-center justify-center rounded transition-colors ${
                overlays.showAirportCounts
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)]'
              }`}
            >
              <Hash className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              disabled={diff.totalChanges === 0}
              onClick={onOpenPublish}
              title={
                diff.totalChanges > 0
                  ? `Publish ${diff.totalChanges} change(s)`
                  : 'No unpublished changes'
              }
              aria-label="Publish changes"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded bg-[#EE1C25] text-white hover:bg-[#cc121a] disabled:opacity-35 transition-colors"
            >
              <CloudUpload className="h-4 w-4" />
              {diff.totalChanges > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-[var(--ink)] px-1 font-mono text-[9px] font-bold tabular-nums text-[var(--surface)]">
                  {diff.totalChanges}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onExit}
              title="Exit Edit Mode"
              aria-label="Exit Edit Mode"
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </aside>
      </>
    );
  }

  return (
    <>
      {hiddenFileInput}

      {/* Left Vertical Edit Mode Menu */}
      <aside
        aria-label="Edit Mode menu"
        className="fixed top-13 bottom-0 left-0 z-30 flex w-[272px] max-w-[86vw] flex-col border-r border-[var(--border)] bg-[var(--surface)]/97 backdrop-blur-sm shadow-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-[var(--ink)]">
                Edit Mode
              </h2>
            </div>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-muted)] truncate">
              {airports.length} stations · {routes.length} routes
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse to compact rail"
              aria-label="Collapse Edit Mode menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)] transition-colors"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onExit}
              title="Exit Edit Mode (keeps your local draft)"
              aria-label="Exit Edit Mode"
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Vertical Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
          {/* Active Origin Callout when drawing */}
          {tool === 'draw' && pendingOrigin && (
            <div className="bg-[var(--sandbox-bg)] px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                  Origin selected{pinOriginDraw ? ' (pinned)' : ''}
                </div>
                <div className="font-mono text-xs font-bold text-[var(--ink)] truncate">
                  {formatCityName(pendingOrigin.city)} ({pendingOrigin.icao})
                </div>
                <div className="text-[11px] text-[var(--ink-secondary)]">
                  Click any destination airport
                </div>
              </div>
              <button
                type="button"
                onClick={onCancelPendingOrigin}
                title="Cancel origin (Esc)"
                className="inline-flex h-7 items-center rounded border border-amber-500/50 bg-[var(--surface)] px-2 font-mono text-[10.5px] font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)] shrink-0"
              >
                Clear
              </button>
            </div>
          )}

          {/* Section 1: Tools & History */}
          <section className="px-4 py-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[var(--ink-secondary)]">
                Map tools
              </h3>
              <div className="flex items-center rounded border border-[var(--border)] bg-[var(--surface-alt)]">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  title={`Undo (Ctrl+Z)${undoCount ? ` · ${undoCount} available` : ''}`}
                  aria-label="Undo"
                  className="inline-flex h-6 w-7 items-center justify-center border-r border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface)] disabled:opacity-35 transition-colors"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  title={`Redo (Ctrl+Shift+Z)${redoCount ? ` · ${redoCount} available` : ''}`}
                  aria-label="Redo"
                  className="inline-flex h-6 w-7 items-center justify-center text-[var(--ink)] hover:bg-[var(--surface)] disabled:opacity-35 transition-colors"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1" role="radiogroup" aria-label="Edit Mode tools">
              {tools.map(({ id, label, shortcut, hint, icon: Icon }) => {
                const selected = tool === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChangeTool(id)}
                    className={`flex items-center justify-between gap-2.5 rounded border px-2.5 py-2 text-left transition-colors ${
                      selected
                        ? 'border-amber-500 bg-[var(--sandbox-bg)] text-[var(--ink)]'
                        : 'border-transparent text-[var(--ink-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded shrink-0 ${
                          selected
                            ? 'bg-amber-600 text-white'
                            : 'bg-[var(--surface-alt)] text-[var(--ink-secondary)]'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold leading-tight text-[var(--ink)] truncate">
                          {label}
                        </div>
                        <div className="text-[11px] leading-tight text-[var(--ink-muted)] truncate mt-0.5">
                          {hint}
                        </div>
                      </div>
                    </div>
                    <kbd className="font-mono text-[10px] text-[var(--ink-muted)] shrink-0">
                      {shortcut}
                    </kbd>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 2: Smart Draw Settings (shown when Draw tool is active) */}
          {tool === 'draw' && (
            <section className="px-4 py-3.5 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)]">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>New route defaults</span>
              </div>

              {/* Quick Brainstorm Modifiers */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={bidirectionalDraw}
                  onClick={onToggleBidirectionalDraw}
                  className="flex w-full items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--surface-alt)]/60 px-2.5 py-2 text-left hover:bg-[var(--surface-alt)] transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <ArrowLeftRight className="h-3.5 w-3.5 text-[var(--ink-secondary)] shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-[var(--ink)] leading-tight">
                        Round-trip (A ↔ B)
                      </span>
                      <span className="block text-[10.5px] text-[var(--ink-muted)] leading-tight mt-0.5">
                        Create outbound & return together
                      </span>
                    </span>
                  </span>
                  <span
                    className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors shrink-0 ${
                      bidirectionalDraw ? 'bg-amber-600 justify-end' : 'bg-[var(--border-strong)] justify-start'
                    }`}
                  >
                    <span className="h-3 w-3 rounded-full bg-white" />
                  </span>
                </button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={pinOriginDraw}
                  onClick={onTogglePinOriginDraw}
                  className="flex w-full items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--surface-alt)]/60 px-2.5 py-2 text-left hover:bg-[var(--surface-alt)] transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Pin className="h-3.5 w-3.5 text-[var(--ink-secondary)] shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-[var(--ink)] leading-tight">
                        Pin origin hub
                      </span>
                      <span className="block text-[10.5px] text-[var(--ink-muted)] leading-tight mt-0.5">
                        Draw multiple spokes in a row
                      </span>
                    </span>
                  </span>
                  <span
                    className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors shrink-0 ${
                      pinOriginDraw ? 'bg-amber-600 justify-end' : 'bg-[var(--border-strong)] justify-start'
                    }`}
                  >
                    <span className="h-3 w-3 rounded-full bg-white" />
                  </span>
                </button>
              </div>

              {/* Default Fleet & Route Type */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label
                    htmlFor="edit-default-aircraft"
                    className="block text-[11px] font-medium text-[var(--ink-muted)]"
                  >
                    Aircraft
                  </label>
                  <input
                    id="edit-default-aircraft"
                    list="edit-aircraft-presets"
                    type="text"
                    value={defaultAircraft}
                    onChange={(e) => onChangeDefaultAircraft(e.target.value)}
                    placeholder="A320neo"
                    className="h-8 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 font-mono text-[11px] text-[var(--ink)] outline-none focus:border-amber-500"
                  />
                  <datalist id="edit-aircraft-presets">
                    {aircraftSuggestions.map((ac) => (
                      <option key={ac} value={ac} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="edit-default-type"
                    className="block text-[11px] font-medium text-[var(--ink-muted)]"
                  >
                    Route type
                  </label>
                  <select
                    id="edit-default-type"
                    value={defaultRouteType}
                    onChange={(e) => onChangeDefaultRouteType(e.target.value)}
                    className="h-8 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 font-mono text-[11px] text-[var(--ink)] outline-none focus:border-amber-500"
                  >
                    {ROUTE_TYPE_PRESETS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Color Picker + Swatches */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[var(--ink-muted)]">
                    Route color
                  </span>
                  <span className="font-mono text-[10.5px] uppercase text-[var(--ink-muted)]">
                    {routeColor}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={routeColor}
                    onChange={(e) => onChangeColor(e.target.value)}
                    title="Custom route color"
                    aria-label="Custom route color"
                    className="h-7 w-8 cursor-pointer rounded border border-[var(--border-strong)] bg-transparent p-0.5 shrink-0"
                  />
                  <div className="flex flex-1 items-center justify-between gap-1">
                    {SANDBOX_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => onChangeColor(preset.hex)}
                        title={preset.label}
                        aria-label={`Set color ${preset.label}`}
                        className={`h-6 flex-1 rounded-sm border transition-transform ${
                          routeColor.toLowerCase() === preset.hex.toLowerCase()
                            ? 'scale-105 border-[var(--ink)] ring-1 ring-[var(--ink)]'
                            : 'border-black/20 hover:scale-105'
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Section 3: Visual Overlays */}
          <section className="px-4 py-3.5 space-y-2">
            <h3 className="text-xs font-semibold text-[var(--ink-secondary)]">
              Map layers
            </h3>
            <div className="space-y-1">
              {(
                [
                  {
                    key: 'showLiveRoutes' as const,
                    label: 'Live routes overlay',
                    desc: 'Dashed baseline from database',
                    icon: Layers,
                    activeColor: 'text-[#EE1C25]',
                  },
                  {
                    key: 'showSandboxRoutes' as const,
                    label: 'Draft routes',
                    desc: 'Your local Edit Mode sectors',
                    icon: Route,
                    activeColor: 'text-amber-700 dark:text-amber-400',
                  },
                  {
                    key: 'showAirportCounts' as const,
                    label: 'Airport route counts',
                    desc: 'Numbers & live deltas above pins',
                    icon: Hash,
                    activeColor: 'text-amber-700 dark:text-amber-400',
                  },
                  {
                    key: 'showAllAirports' as const,
                    label: 'Show inactive stations',
                    desc: 'Include unserved & hidden pins',
                    icon: Eye,
                    activeColor: 'text-[var(--ink)]',
                  },
                ] as const
              ).map(({ key, label, desc, icon: Icon, activeColor }) => {
                const enabled = overlays[key];
                return (
                  <button
                    key={key}
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => onToggleOverlay(key)}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--surface-alt)] transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          enabled ? activeColor : 'text-[var(--ink-muted)]'
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-[var(--ink)] leading-tight truncate">
                          {label}
                        </span>
                        <span className="block text-[10.5px] text-[var(--ink-muted)] leading-tight truncate">
                          {desc}
                        </span>
                      </span>
                    </span>
                    <span
                      className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors shrink-0 ${
                        enabled
                          ? 'bg-[var(--ink)] justify-end'
                          : 'bg-[var(--border-strong)] justify-start'
                      }`}
                    >
                      <span className="h-3 w-3 rounded-full bg-[var(--surface)]" />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 4: Live Diff & Jump-to-Change Inspector */}
          <section className="px-4 py-3.5 space-y-2">
            <button
              type="button"
              onClick={() => setChangesExpanded((v) => !v)}
              className="flex w-full items-center justify-between text-left"
              aria-expanded={changesExpanded}
            >
              <div className="min-w-0">
                <h3 className="text-xs font-semibold text-[var(--ink-secondary)]">
                  Unpublished changes
                </h3>
                <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-muted)] truncate">
                  {diff.totalChanges === 0 ? 'Matches live map' : diffParts.join(' · ')}
                </p>
              </div>
              {diff.totalChanges > 0 && (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] shrink-0">
                  {changesExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </span>
              )}
            </button>

            {changesExpanded && diff.totalChanges > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border border-[var(--border)] bg-[var(--surface-alt)]/60 divide-y divide-[var(--border)]">
                {diff.airportsAdded.map((a) => (
                  <button
                    key={`add-ap-${a.icao}`}
                    type="button"
                    onClick={() => onFocusAirport(a)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--surface)] transition-colors"
                  >
                    <span className="truncate text-[var(--ink)]">
                      <span className="font-mono font-semibold text-[var(--ok)] mr-1.5">+</span>
                      {formatCityName(a.city)} ({a.icao})
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink-muted)] shrink-0">
                      Airport
                    </span>
                  </button>
                ))}
                {diff.airportsModified.map((a) => (
                  <button
                    key={`mod-ap-${a.icao}`}
                    type="button"
                    onClick={() => onFocusAirport(a)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--surface)] transition-colors"
                  >
                    <span className="truncate text-[var(--ink)]">
                      <span className="font-mono font-semibold text-amber-600 mr-1.5">~</span>
                      {formatCityName(a.city)} ({a.icao})
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink-muted)] shrink-0">
                      Airport
                    </span>
                  </button>
                ))}
                {diff.routesAdded.slice(0, 20).map((r, i) => (
                  <button
                    key={`add-rt-${r.origin}-${r.dest}-${i}`}
                    type="button"
                    onClick={() => onInspectRoute(r)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--surface)] transition-colors"
                  >
                    <span className="font-mono truncate text-[var(--ink)]">
                      <span className="font-semibold text-[var(--ok)] mr-1.5">+</span>
                      {r.origin} → {r.dest}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink-muted)] shrink-0">
                      {r.type}
                    </span>
                  </button>
                ))}
                {diff.routesModified.slice(0, 20).map((r, i) => (
                  <button
                    key={`mod-rt-${r.origin}-${r.dest}-${i}`}
                    type="button"
                    onClick={() => onInspectRoute(r)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--surface)] transition-colors"
                  >
                    <span className="font-mono truncate text-[var(--ink)]">
                      <span className="font-semibold text-amber-600 mr-1.5">~</span>
                      {r.origin} → {r.dest}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--ink-muted)] shrink-0">
                      Edited
                    </span>
                  </button>
                ))}
                {diff.airportsRemoved.map((a) => (
                  <div
                    key={`rem-ap-${a.icao}`}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] text-[var(--ink-muted)]"
                  >
                    <span className="truncate line-through">
                      <span className="font-mono font-semibold text-[var(--err)] mr-1.5 no-underline">
                        -
                      </span>
                      {formatCityName(a.city)} ({a.icao})
                    </span>
                    <span className="font-mono text-[10px] shrink-0">Removed</span>
                  </div>
                ))}
                {diff.routesRemoved.slice(0, 15).map((r, i) => (
                  <div
                    key={`rem-rt-${r.origin}-${r.dest}-${i}`}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-muted)]"
                  >
                    <span className="truncate line-through">
                      <span className="font-semibold text-[var(--err)] mr-1.5">-</span>
                      {r.origin} → {r.dest}
                    </span>
                    <span className="text-[10px] shrink-0">Removed</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 5: Data & Workspace Utilities */}
          <section className="px-4 py-3.5 space-y-2">
            <h3 className="text-xs font-semibold text-[var(--ink-secondary)]">
              Workspace actions
            </h3>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)] transition-colors whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
                <span>Import</span>
              </button>

              <button
                type="button"
                onClick={onExport}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)] transition-colors whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
                <span>Export</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenInEditor}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface-alt)]/70 px-2.5 text-xs font-medium text-[var(--ink)] hover:bg-[var(--surface-alt)] transition-colors whitespace-nowrap"
            >
              <Table2 className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
              <span>Open draft in Table Editor</span>
            </button>

            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={onClearRoutes}
                disabled={routes.length === 0}
                title="Remove all routes locally for blank-slate brainstorming"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-red-500/35 px-2 text-xs font-medium text-[var(--err)] hover:bg-red-500/10 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear routes</span>
              </button>

              <button
                type="button"
                onClick={onResetToLive}
                disabled={diff.totalChanges === 0}
                title="Discard local edits and reload live map"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)] disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset live</span>
              </button>
            </div>
          </section>
        </div>

        {/* Pinned Footer CTA */}
        <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 shrink-0 space-y-2">
          <button
            type="button"
            disabled={diff.totalChanges === 0}
            onClick={onOpenPublish}
            title={
              firebaseReady
                ? 'Choose how to publish Edit Mode changes to the live map'
                : 'Choose how to apply Edit Mode changes locally'
            }
            className="flex h-9 w-full items-center justify-center gap-2 rounded bg-[#EE1C25] px-4 text-xs font-semibold text-white hover:bg-[#cc121a] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <CloudUpload className="h-4 w-4" />
            <span>
              Publish changes{diff.totalChanges > 0 ? ` (${diff.totalChanges})` : ''}
            </span>
          </button>
          <p className="text-center font-mono text-[10px] text-[var(--ink-muted)]">
            Local only until published · Shortcuts: D E A X
          </p>
        </div>
      </aside>
    </>
  );
}
