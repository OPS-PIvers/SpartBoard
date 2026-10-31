import React, { useId, useState } from 'react';
import { History, LayoutGrid, Play, Save, Trash2, X } from 'lucide-react';
import type {
  ClassRoster,
  FocusConfig,
  FocusSavedSiteList,
  WidgetData,
} from '@/types';
import {
  FOCUS_LEVELS,
  FOCUS_MAX_MINUTES,
  FOCUS_MAX_SITES,
  type FocusSite,
} from '@/utils/focus/contract';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { tourAttr } from '@/config/tourAnchors';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import {
  addFocusSite,
  boardFocusSites,
  focusSiteLabel,
  rosterClassId,
} from './focusWidgetState';
import { FOCUS_LEVEL_TEXT } from './focusLevels';
import { SiteInput } from './SiteInput';
import { FocusButton, SectionLabel } from './ui';
import { FIELD_HEIGHT } from './uiSizes';

const LENGTHS = Array.from(
  { length: FOCUS_MAX_MINUTES / 5 },
  (_, i) => (i + 1) * 5
);

const FULL_MESSAGE = `A session allows up to ${FOCUS_MAX_SITES} sites.`;

export const FocusSetup: React.FC<{
  widget: WidgetData;
  config: FocusConfig;
  rosters: ClassRoster[];
  boardWidgets: WidgetData[];
  onChange: (patch: Partial<FocusConfig>) => void;
  onStart: () => void;
  starting: boolean;
  /** Still checking for a running session: Start waits. */
  checking: boolean;
  error: string | null;
  pastCount: number;
  onOpenPast: () => void;
}> = ({
  widget,
  config,
  rosters,
  boardWidgets,
  onChange,
  onStart,
  starting,
  checking,
  error,
  pastCount,
  onOpenPast,
}) => {
  const classSelectId = useId();
  const lengthId = useId();
  const levelLabelId = useId();
  const sites = config.sites ?? [];
  const level = config.level ?? 'redirect';
  const minutes = config.minutes ?? 30;
  const selected = rosters.find((r) => r.id === config.rosterId) ?? null;
  const fromBoard = boardFocusSites(boardWidgets, sites);
  const full = sites.length >= FOCUS_MAX_SITES;

  const setSites = (next: FocusSite[]) => onChange({ sites: next });

  const canStart = !!selected && sites.length > 0 && !starting && !checking;
  let startHint: string | null = null;
  if (!selected) startHint = 'Pick a class to start.';
  else if (sites.length === 0) startHint = 'Add at least one site to start.';

  return (
    <div className="flex h-full w-full flex-col">
      <div
        className="relative z-1 min-h-0 flex-1 overflow-y-auto"
        style={{
          padding: `min(15px, 3cqmin) min(15px, 3.6cqmin)`,
          paddingBottom: 'max(16px, 3cqmin)',
        }}
      >
        <div style={{ marginBottom: 'min(15px, 3.6cqmin)' }}>
          <SectionLabel htmlFor={classSelectId}>Class</SectionLabel>
          <select
            id={classSelectId}
            value={selected?.id ?? ''}
            onChange={(e) => {
              const r = rosters.find((x) => x.id === e.target.value);
              onChange(
                r
                  ? {
                      rosterId: r.id,
                      classId: rosterClassId(r),
                      className: r.name,
                    }
                  : {
                      rosterId: undefined,
                      classId: undefined,
                      className: undefined,
                    }
              );
            }}
            className="w-full rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
            style={{
              fontSize: 'min(15px, 4.8cqmin)',
              padding: `0 min(8px, 2.2cqmin)`,
              minHeight: FIELD_HEIGHT,
            }}
            {...tourAttr('focus.class', widget.id)}
          >
            <option value="">Pick a class</option>
            {rosters.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 'min(15px, 3.6cqmin)' }}>
          <SectionLabel id={`${widget.id}-sites`}>Allowed sites</SectionLabel>
          <SiteInput
            widgetId={widget.id}
            label="Add a site"
            fullMessage={full ? FULL_MESSAGE : null}
            onAdd={(site) => setSites(addFocusSite(sites, site))}
          />
          {sites.length > 0 && (
            <ul
              aria-labelledby={`${widget.id}-sites`}
              className="divide-y divide-slate-200 border-y border-slate-200"
              style={{ marginTop: 'min(8px, 2cqmin)' }}
            >
              {sites.map((s) => (
                <li
                  key={focusSiteLabel(s)}
                  className="flex items-center justify-between text-slate-800"
                  style={{
                    fontSize: 'min(15px, 4.6cqmin)',
                    padding: `min(4px, 1.2cqmin) 0`,
                    gap: 'min(8px, 2cqmin)',
                  }}
                >
                  <span className="min-w-0 break-all">{focusSiteLabel(s)}</span>
                  <button
                    type="button"
                    onClick={() => setSites(sites.filter((x) => x !== s))}
                    aria-label={`Remove ${focusSiteLabel(s)}`}
                    className="inline-flex shrink-0 items-center justify-center rounded-sm text-slate-600 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                    style={{
                      minWidth: 'min(32px, 7cqmin)',
                      minHeight: 'min(32px, 7cqmin)',
                    }}
                    {...tourAttr('focus.remove-site', widget.id)}
                  >
                    <X
                      aria-hidden="true"
                      style={{
                        width: 'min(16px, 4.6cqmin)',
                        height: 'min(16px, 4.6cqmin)',
                      }}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div
            className="flex flex-wrap items-center"
            style={{
              gap: 'min(6px, 1.6cqmin)',
              marginTop: 'min(6px, 1.6cqmin)',
            }}
          >
            <FocusButton
              size="sm"
              variant="ghost"
              icon={LayoutGrid}
              disabled={fromBoard.length === 0 || full}
              title={
                fromBoard.length === 0
                  ? 'No new sites in this board’s Links or Embed widgets'
                  : undefined
              }
              onClick={() => setSites(fromBoard.reduce(addFocusSite, sites))}
              {...tourAttr('focus.sites-from-board', widget.id)}
            >
              {fromBoard.length > 0
                ? `Add ${fromBoard.length} from this board`
                : 'Add from this board'}
            </FocusButton>
            <SavedLists widgetId={widget.id} sites={sites} onLoad={setSites} />
          </div>
        </div>

        <div
          role="radiogroup"
          aria-labelledby={levelLabelId}
          style={{ marginBottom: 'min(15px, 3.6cqmin)' }}
        >
          <SectionLabel id={levelLabelId}>Level</SectionLabel>
          <div
            className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-300"
            {...tourAttr('focus.level', widget.id)}
            onKeyDown={(e) =>
              handleRadioGroupKeyDown(e, FOCUS_LEVELS, (l) =>
                onChange({ level: l })
              )
            }
          >
            {FOCUS_LEVELS.map((l, i) => (
              // no-tour-anchor: tours point at the whole group (focus.level)
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={level === l}
                tabIndex={level === l ? 0 : -1}
                onClick={() => onChange({ level: l })}
                className={`font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary ${
                  i > 0 ? 'border-l border-slate-300' : ''
                } ${
                  level === l
                    ? 'bg-brand-blue-primary text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
                style={{
                  fontSize: 'min(15px, 4.6cqmin)',
                  minHeight: FIELD_HEIGHT,
                }}
              >
                {FOCUS_LEVEL_TEXT[l].label}
              </button>
            ))}
          </div>
          <p
            className="text-slate-600"
            style={{
              fontSize: 'min(15px, 4.6cqmin)',
              marginTop: 'min(4px, 1.2cqmin)',
            }}
          >
            {FOCUS_LEVEL_TEXT[level].detail}
          </p>
        </div>

        <div>
          <SectionLabel htmlFor={lengthId}>Length</SectionLabel>
          <select
            id={lengthId}
            value={minutes}
            onChange={(e) => onChange({ minutes: Number(e.target.value) })}
            className="rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
            style={{
              fontSize: 'min(15px, 4.8cqmin)',
              padding: `0 min(8px, 2.2cqmin)`,
              minHeight: FIELD_HEIGHT,
            }}
            {...tourAttr('focus.length', widget.id)}
          >
            {LENGTHS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="shrink-0 border-t border-slate-200"
        style={{ padding: `min(10px, 2.6cqmin) min(15px, 3.6cqmin)` }}
      >
        {(error ?? startHint) && (
          <p
            role={error ? 'alert' : undefined}
            className={error ? 'text-red-700' : 'text-slate-600'}
            style={{
              fontSize: 'min(15px, 4.6cqmin)',
              marginBottom: 'min(6px, 1.6cqmin)',
            }}
          >
            {error ?? startHint}
          </p>
        )}
        <div
          className="flex items-center justify-between"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          <FocusButton
            size="sm"
            variant="ghost"
            icon={History}
            disabled={pastCount === 0}
            onClick={onOpenPast}
            {...tourAttr('focus.past-sessions', widget.id)}
          >
            Past sessions
          </FocusButton>
          <FocusButton
            size="lg"
            variant="primary"
            icon={Play}
            disabled={!canStart}
            onClick={onStart}
            {...tourAttr('focus.start', widget.id)}
          >
            {starting ? 'Starting…' : 'Start'}
          </FocusButton>
        </div>
      </div>
    </div>
  );
};

/** Per-teacher site lists, saved to the profile so they work on any board. */
const SavedLists: React.FC<{
  widgetId: string;
  sites: FocusSite[];
  onLoad: (sites: FocusSite[]) => void;
}> = ({ widgetId, sites, onLoad }) => {
  const { savedWidgetPresets, saveWidgetPreset } = useAuth();
  const { showPrompt, showConfirm } = useDialog();
  const [open, setOpen] = useState(false);
  const lists: FocusSavedSiteList[] =
    (savedWidgetPresets.focus as Partial<FocusConfig> | undefined)
      ?.savedSiteLists ?? [];
  const write = (next: FocusSavedSiteList[]) =>
    saveWidgetPreset('focus', { savedSiteLists: next });

  const save = async () => {
    const name = await showPrompt('Name this list of sites.', {
      title: 'Save sites',
      confirmLabel: 'Save',
    });
    if (!name?.trim()) return;
    write([
      ...lists,
      {
        id: crypto.randomUUID(),
        name: name.trim().slice(0, 80),
        sites: sites.map((s) => ({ host: s.host, path: s.path })),
        createdAt: Date.now(),
      },
    ]);
    setOpen(true);
  };

  const remove = async (list: FocusSavedSiteList) => {
    const ok = await showConfirm(`Delete the saved list "${list.name}"?`, {
      title: 'Delete saved list',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) write(lists.filter((l) => l.id !== list.id));
  };

  return (
    <>
      <FocusButton
        size="sm"
        variant="ghost"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        {...tourAttr('focus.saved-lists', widgetId)}
      >
        Saved lists{lists.length > 0 ? ` (${lists.length})` : ''}
      </FocusButton>
      {open && (
        <div className="w-full" style={{ marginTop: 'min(4px, 1cqmin)' }}>
          {lists.length === 0 ? (
            <p
              className="text-slate-600"
              style={{ fontSize: 'min(15px, 4.6cqmin)' }}
            >
              No saved lists yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 border-y border-slate-200">
              {lists.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between"
                  style={{
                    padding: `min(4px, 1.2cqmin) 0`,
                    gap: 'min(6px, 1.6cqmin)',
                  }}
                >
                  <span
                    className="min-w-0 truncate text-slate-800"
                    style={{ fontSize: 'min(15px, 4.6cqmin)' }}
                    title={l.sites.map(focusSiteLabel).join(', ')}
                  >
                    {l.name}{' '}
                    <span className="text-slate-600">
                      ({l.sites.length}{' '}
                      {l.sites.length === 1 ? 'site' : 'sites'})
                    </span>
                  </span>
                  <span
                    className="flex shrink-0"
                    style={{ gap: 'min(4px, 1cqmin)' }}
                  >
                    <FocusButton
                      size="sm"
                      variant="ghost"
                      onClick={() => onLoad(l.sites)}
                      {...tourAttr('focus.load-list', widgetId)}
                    >
                      Use
                    </FocusButton>
                    <FocusButton
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      aria-label={`Delete ${l.name}`}
                      onClick={() => void remove(l)}
                      {...tourAttr('focus.delete-list', widgetId)}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <FocusButton
            size="sm"
            variant="ghost"
            icon={Save}
            disabled={sites.length === 0}
            onClick={() => void save()}
            style={{ marginTop: 'min(4px, 1cqmin)' }}
            {...tourAttr('focus.save-list', widgetId)}
          >
            Save these sites
          </FocusButton>
        </div>
      )}
    </>
  );
};
