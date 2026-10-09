import React, { useRef, useState } from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { ChevronDown, CircleHelp, Download, Eye } from 'lucide-react';
import { CellPopover } from '@/components/admin/Organization/components/primitives';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { Toggle } from '@/components/common/Toggle';
import { spaNavigate } from '@/utils/plcPath';
import { buildGradebookPath } from '@/utils/gradebookPath';
import {
  GRADEBOOK_KINDS,
  type GradebookSort,
} from '@/utils/gradebook/gradebookCore';
import {
  flagChipClasses,
  type NameFormat,
} from '@/utils/gradebook/gradebookModel';
import { useGradebook } from './GradebookContext';
import { GRADEBOOK_KIND_META } from './kindMeta';
import { GradebookSettingsButton } from './settings/GradebookSettingsModal';
import { GradebookExportMenu } from './export/GradebookExportMenu';

type Menu = 'view' | 'filter' | 'help' | null;

const selectCls = `appearance-none h-[34px] rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-[13px] font-semibold text-slate-700 focus:border-brand-blue-primary focus:outline-none focus:ring-[3px] focus:ring-brand-blue-primary/30`;
const menuSelectCls = `appearance-none h-10 w-full rounded-lg border border-slate-300 bg-white pl-3 pr-8 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-[3px] focus:ring-brand-blue-primary/30`;
/** Native select with the prototype's chevron. */
const Sel: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement> & { wrapClassName?: string }
> = ({ wrapClassName = '', ...rest }) => (
  <span className={`relative inline-flex ${wrapClassName}`}>
    <select {...rest} />
    <ChevronDown
      className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      aria-hidden
    />
  </span>
);

const iconBtn = (pressed: boolean) =>
  `grid h-[34px] w-[34px] place-items-center rounded-lg ${
    pressed
      ? 'bg-brand-blue-lighter text-brand-blue-primary'
      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
  }`;
const menuBtn = (open: boolean) =>
  `inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-semibold ${
    open
      ? 'border-brand-blue-primary/40 bg-brand-blue-lighter text-brand-blue-primary'
      : 'border-transparent text-slate-600 hover:bg-slate-100'
  }`;

const Label: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({
  children,
  htmlFor,
}) => (
  <label
    htmlFor={htmlFor}
    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-700"
  >
    {children}
  </label>
);

const ToggleRow: React.FC<{
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  anchor?: TourAnchorAttrs;
}> = ({ checked, onChange, label, anchor }) => (
  <div className="flex items-center gap-2 text-[13px] text-slate-600">
    <Toggle
      size="xs"
      showLabels={false}
      checked={checked}
      onChange={onChange}
      label={label}
      anchor={anchor}
    />
    <span onClick={() => onChange(!checked)} className="cursor-pointer">
      {label}
    </span>
  </div>
);

const sortValue = (s: GradebookSort): string =>
  s.ref ? `${s.key}:${s.ref}` : s.key;

/** Class and period selects, View and Filter menus, and the four icon buttons (D19). */
export const GradebookSubBar: React.FC<{ onGrid: boolean }> = ({ onGrid }) => {
  const gb = useGradebook();
  const {
    rosters,
    rosterId,
    periods,
    periodId,
    setPeriodId,
    view,
    setView,
    filters,
    setFilters,
    settings,
    privacy,
    setPrivacy,
    allColumns,
    roster,
  } = gb;
  const [menu, setMenu] = useState<Menu>(null);
  const viewRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLButtonElement>(null);
  const helpRef = useRef<HTMLButtonElement>(null);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const toggle = (m: Menu) => setMenu((cur) => (cur === m ? null : m));
  const close = () => setMenu(null);

  const hiddenColumns = allColumns.filter((c) => c.hidden);
  const activeFilters =
    (filters.categoryId ? 1 : 0) +
    (filters.kind ? 1 : 0) +
    (filters.needsGrading ? 1 : 0) +
    (hiddenColumns.length ? 1 : 0);
  const liveFlags = settings.flags.filter((f) => f.visibility !== 'off');
  const groups = roster.groups ?? [];

  const onSortChange = (v: string) => {
    if (v === 'last' || v === 'first') {
      setView({ sort: { key: v, dir: 'asc', ref: null } });
      return;
    }
    const [key, ref] = v.split(':');
    setView({
      sort: {
        key: key as GradebookSort['key'],
        dir: key === 'group' ? 'asc' : 'desc',
        ref: ref ?? null,
      },
    });
  };

  return (
    <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 md:px-6">
      <Sel
        aria-label="Class"
        value={rosterId}
        onChange={(e) => spaNavigate(buildGradebookPath(e.target.value))}
        className={selectCls}
      >
        {rosters.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Sel>
      <Sel
        aria-label="Grading period"
        value={periodId ?? 'all'}
        onChange={(e) =>
          setPeriodId(e.target.value === 'all' ? null : e.target.value)
        }
        className={selectCls}
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value="all">All periods</option>
      </Sel>
      <span className="flex-1" />
      {onGrid && (
        <>
          <button
            ref={viewRef}
            type="button"
            className={menuBtn(menu === 'view')}
            aria-haspopup="true"
            aria-expanded={menu === 'view'}
            onClick={() => toggle('view')}
          >
            View
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
          <button
            ref={filterRef}
            type="button"
            className={menuBtn(menu === 'filter')}
            aria-haspopup="true"
            aria-expanded={menu === 'filter'}
            onClick={() => toggle('filter')}
          >
            Filter
            {activeFilters > 0 && (
              <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-blue-primary px-1.5 text-[11px] font-bold text-white">
                {activeFilters}
              </span>
            )}
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
        </>
      )}
      <button
        type="button"
        className={iconBtn(privacy)}
        aria-pressed={privacy}
        aria-label="Privacy blur"
        title="Privacy blur (P)"
        onClick={() => setPrivacy(!privacy)}
      >
        <Eye className="h-[18px] w-[18px]" aria-hidden />
      </button>
      <button
        type="button"
        className={iconBtn(exportAnchor !== null)}
        aria-label="Export"
        title="Export"
        onClick={(e) => {
          const el = e.currentTarget;
          setExportAnchor((cur) => (cur ? null : el));
        }}
      >
        <Download className="h-[18px] w-[18px]" aria-hidden />
      </button>
      <GradebookSettingsButton
        classes={rosters.map((r) => ({ id: r.id, name: r.name }))}
        currentClassId={rosterId}
        className={iconBtn(false)}
      />
      <button
        ref={helpRef}
        type="button"
        className={iconBtn(menu === 'help')}
        aria-label="Help and shortcuts"
        title="Help and shortcuts"
        aria-expanded={menu === 'help'}
        onClick={() => toggle('help')}
      >
        <CircleHelp className="h-[18px] w-[18px]" aria-hidden />
      </button>

      <CellPopover
        open={menu === 'view'}
        onClose={close}
        anchorRef={viewRef}
        className="w-[300px] !p-4"
      >
        <div className="flex flex-col gap-4">
          <div>
            <Label>Scores</Label>
            <div className="flex flex-col gap-2.5">
              <SegmentedControl
                role="radiogroup"
                ariaLabel="Scores"
                value={view.cellFormat}
                onChange={(v) => setView({ cellFormat: v })}
                options={[
                  { value: 'percent', label: 'Percent' },
                  { value: 'points', label: 'Points' },
                ]}
              />
              <ToggleRow
                checked={view.tint}
                onChange={(on) => setView({ tint: on })}
                label="Proficiency colors"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="gb-names">Names</Label>
            <Sel
              id="gb-names"
              className={menuSelectCls}
              wrapClassName="w-full"
              value={view.nameFormat}
              onChange={(e) =>
                setView({ nameFormat: e.target.value as NameFormat })
              }
            >
              <option value="last-first">Last, First</option>
              <option value="first-last">First Last</option>
              <option value="last-only">Last only</option>
              <option value="first-only">First only</option>
            </Sel>
          </div>
          <div>
            <Label htmlFor="gb-sort">Sort rows</Label>
            <Sel
              id="gb-sort"
              className={menuSelectCls}
              wrapClassName="w-full"
              value={sortValue(view.sort)}
              onChange={(e) => onSortChange(e.target.value)}
            >
              <option value="last">Last name</option>
              <option value="first">First name</option>
              <option value="overall">Overall</option>
              <option value="missing">Missing count</option>
              {view.sort.key === 'column' && view.sort.ref && (
                <option value={`column:${view.sort.ref}`}>
                  {allColumns.find((c) => c.sessionId === view.sort.ref)
                    ?.title ?? 'Assignment'}
                </option>
              )}
              {liveFlags.length > 0 && (
                <optgroup label="Flag">
                  {liveFlags.map((f) => (
                    <option key={f.id} value={`flag:${f.id}`}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {groups.length > 0 && (
                <optgroup label="Group">
                  {groups.map((g) => (
                    <option key={g.id} value={`group:${g.id}`}>
                      {g.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Sel>
          </div>
        </div>
      </CellPopover>

      <CellPopover
        open={menu === 'filter'}
        onClose={close}
        anchorRef={filterRef}
        className="w-[300px] !p-4"
      >
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="gb-fcat">Category</Label>
            <Sel
              id="gb-fcat"
              className={menuSelectCls}
              wrapClassName="w-full"
              value={filters.categoryId ?? 'all'}
              onChange={(e) =>
                setFilters({
                  categoryId: e.target.value === 'all' ? null : e.target.value,
                })
              }
            >
              <option value="all">All</option>
              {settings.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Sel>
          </div>
          <div>
            <Label htmlFor="gb-fkind">Activity type</Label>
            <Sel
              id="gb-fkind"
              className={menuSelectCls}
              wrapClassName="w-full"
              value={filters.kind ?? 'all'}
              onChange={(e) =>
                setFilters({
                  kind: e.target.value === 'all' ? null : e.target.value,
                })
              }
            >
              <option value="all">All</option>
              {GRADEBOOK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {GRADEBOOK_KIND_META[k].label}
                </option>
              ))}
            </Sel>
          </div>
          <ToggleRow
            checked={filters.needsGrading}
            onChange={(on) => setFilters({ needsGrading: on })}
            label="Only columns with ungraded work"
          />
          {hiddenColumns.length > 0 && (
            <div>
              <Label>Hidden columns</Label>
              <ul className="mb-2 text-xs text-slate-700">
                {hiddenColumns.map((c) => (
                  <li key={c.sessionId}>{c.title}</li>
                ))}
              </ul>
              <button
                type="button"
                className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                onClick={() => {
                  for (const c of hiddenColumns) {
                    void gb.updateColumn(c.sessionId, {
                      hiddenInRosterIds: (
                        c.config?.hiddenInRosterIds ?? []
                      ).filter((id) => id !== rosterId),
                    });
                  }
                }}
              >
                Show all
              </button>
            </div>
          )}
        </div>
      </CellPopover>

      <CellPopover
        open={menu === 'help'}
        onClose={close}
        anchorRef={helpRef}
        className="w-[320px] !p-4"
      >
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[13px] text-slate-700">
          {[
            ['Arrows', 'Move between cells'],
            ['0–9', 'Start typing a score'],
            ['Enter', 'Open the cell'],
            [liveFlags.map((f) => f.key).join(' '), 'Toggle a flag'],
            ['Ctrl+Z', 'Undo'],
            ['P', 'Privacy blur'],
          ].map(([k, v]) => (
            <React.Fragment key={v}>
              <dt>
                <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-xs font-semibold text-slate-700">
                  {k}
                </kbd>
              </dt>
              <dd>{v}</dd>
            </React.Fragment>
          ))}
        </dl>
        <dl className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-[13px] text-slate-700">
          <dt className="italic underline decoration-dotted decoration-amber-600 underline-offset-[3px]">
            85%
          </dt>
          <dd>Not published yet</dd>
          <dt className="grid place-items-center">
            <span className="h-[7px] w-[7px] rounded-full bg-amber-600" />
          </dt>
          <dd>Column has unpublished scores</dd>
          <dt>
            <span
              className={`grid h-4 min-w-4 place-items-center rounded px-[3px] text-[9.5px] font-bold ${flagChipClasses('rose', true)}`}
            >
              M
            </span>
          </dt>
          <dd>Flag applied automatically</dd>
          <dt>
            <span
              className={`grid h-4 min-w-4 place-items-center rounded px-[3px] text-[9.5px] font-bold ${flagChipClasses('rose', false)}`}
            >
              M+
            </span>
          </dt>
          <dd>More than one flag</dd>
        </dl>
      </CellPopover>

      {exportAnchor && (
        <GradebookExportMenu
          anchor={exportAnchor}
          onClose={() => setExportAnchor(null)}
        />
      )}
    </div>
  );
};
