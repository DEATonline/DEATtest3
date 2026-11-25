import React, { useEffect } from 'react';
import { History, X } from 'lucide-react';

export const EDIT_MODE_VERSION = 'v2.4';

interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

const CHANGELOG_ENTRIES: ChangelogRelease[] = [
  {
    version: 'v2.4',
    date: 'Nov 2026',
    title: 'Vertical Edit Mode Studio & Multi-Leg Chaining',
    changes: [
      'Moved Edit Mode controls into a collapsible vertical menu on the left edge of the map.',
      'Added Chain legs mode to draw sequential multi-stop routes (A → B → C) continuously from each destination.',
      'Added Pin origin hub mode, default aircraft/type/color presets, and single-key shortcuts (D, E, A, X).',
      'Moved the full Network Editor into Edit Mode and placed Admin Login in the top bar.',
      'Exiting Edit Mode now cleanly resets map filters, overlays, and draw settings to their defaults.',
      'Updated the light-mode cartographic palette (#f3f5f8 background, #e1e6ed landmasses).',
    ],
  },
  {
    version: 'v2.3',
    date: 'Nov 2026',
    title: 'Smart Import & Publish Strategies',
    changes: [
      'Renamed Sandbox Mode to Edit Mode across the entire interface.',
      'Importing JSON now prompts to either merge with current routes or replace old routes.',
      'Publishing now prompts to either overwrite the live map or add only new routes and airports while keeping existing ones.',
    ],
  },
  {
    version: 'v2.2',
    date: 'Nov 2026',
    title: 'Local Editing, Live Overlay & Airport Counts',
    changes: [
      'Redesigned local editing so admins can add, modify, and erase routes and airports without touching Firebase until published.',
      'Added dashed Live Routes overlay and airport sector counts with live change deltas (+ / -).',
      'Added inline right-hand inspector for quick station and flight sector edits with full Undo/Redo.',
    ],
  },
  {
    version: 'v2.1',
    date: 'Nov 2026',
    title: 'Cartographic Engine & Network Editor Overhaul',
    changes: [
      'Upgraded to a memoized D3 Natural Earth map with parallel route arc separation and route hover tooltips.',
      'Added quick airport search (Ctrl/⌘K) with smooth fly-to zoom and responsive mobile filter drawer.',
      'Added map pin coordinate picking, table search/sort, Undo/Redo, and Firestore conflict detection.',
    ],
  },
];

interface ChangelogModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangelogModal({ open, onClose }: ChangelogModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/60 backdrop-blur-[1px] p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-lg max-h-[82vh] flex-col overflow-hidden rounded border border-[var(--border-strong)] bg-[var(--surface)] shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-alt)] px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#EE1C25]" aria-hidden="true" />
            <div>
              <h2
                id="changelog-modal-title"
                className="text-sm font-bold text-[var(--ink)] leading-tight"
              >
                Edit Mode Changelog
              </h2>
              <p className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)] mt-0.5">
                Current version {EDIT_MODE_VERSION} · DEAT Route Network
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close changelog"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] text-[var(--ink-secondary)] hover:bg-[var(--surface)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Release Notes */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)] px-5">
          {CHANGELOG_ENTRIES.map((release, idx) => (
            <section key={release.version} className="py-4 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span
                    className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
                      idx === 0 ? 'text-[#EE1C25]' : 'text-[var(--ink)]'
                    }`}
                  >
                    {release.version}
                  </span>
                  <h3 className="text-xs font-semibold text-[var(--ink)] truncate">
                    {release.title}
                  </h3>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)] shrink-0">
                  {release.date}
                </span>
              </div>

              <ul className="space-y-1.5 pl-3.5 text-xs leading-relaxed text-[var(--ink-secondary)] list-disc marker:text-[var(--ink-muted)]">
                {release.changes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[var(--border)] bg-[var(--surface-alt)] px-5 py-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-4 font-mono text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-alt)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
