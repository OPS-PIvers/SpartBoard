import React, { useContext, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { tourFieldAttr, type TourAnchorAttrs } from '@/config/tourAnchors';
import type { AssignedClass, AssignedStatus } from '@/utils/assignedStatus';
import { OverflowMenu } from '../LibraryOverflowMenu';
import type { LibraryMenuAction } from '../types';
import {
  CLASS_ACTION_LABEL,
  accessBadge,
  classActions,
  classBadge,
  classDetailText,
  detailText,
  type AccessBadge,
  type ClassActionKind,
} from './assignedWording';
import { AssignedCheckbox } from './AssignedBulk';
import { useAssignedRowSelect } from './assignedBulkContext';
import { AssignedFocusClassContext } from './assignedFilterContext';

export interface AssignedRowProps {
  title: string;
  /** From `deriveAssignedStatus`; any assignment kind. */
  status: AssignedStatus;
  nowMs: number;
  /** The next-step button; `choose-class` rows expand instead of calling `onMain`. */
  mainLabel: string | null;
  onMain: () => void;
  mainBadgeCount?: number;
  mainBadgeAriaLabel?: string;
  /** Replaces the derived grey text, e.g. for paper quizzes. */
  detail?: string;
  /** Colours the main button as this action; defaults to the derived one. */
  mainTone?: MainKind;
  /** False hides the per-class actions, e.g. for a paper quiz. */
  classControls?: boolean;
  /** False drops per-class turned-in counts, for kinds whose responses carry no class. */
  classCounts?: boolean;
  /** False where the kind has no pause, or for a view-only share. */
  canPause?: boolean;
  /** A null key acts on the whole single-line assignment (D15). */
  onClassAction: (kind: ClassActionKind, classKey: string | null) => void;
  /** Opens Results from the expanded row. */
  onResults?: () => void;
  /** Today's bell time for a Ready class, e.g. "9:55 to 10:40". */
  bellLabel?: (c: AssignedClass) => string | null;
  /** Shown under the classes: how it closes, the assigned date and join code. */
  footer?: string[];
  /** Extra inline items after the grey text (sync pill, skipped marker). */
  meta?: React.ReactNode;
  menuActions: LibraryMenuAction[];
  busy?: boolean;
  tourIndex: number;
  tourWidgetType: string;
  /** The Assignments hub marks the row its detail pane shows. */
  selected?: boolean;
  /** Clicking the row also picks it, as in the hub. */
  onSelect?: () => void;
  /** Tour anchor for the title when it picks the row. */
  selectAnchor?: TourAnchorAttrs;
  /** Drops turned-in counts the caller can't place in a class. */
  hideCounts?: boolean;
}

type MainKind = AssignedStatus['action']['kind'];
type Tint = MainKind | ClassActionKind;
const RING = 'ring-1 ring-inset';
const GREEN = `bg-emerald-50 text-emerald-700 ${RING} ring-emerald-200 hover:bg-emerald-100`;
const AMBER = `bg-amber-50 text-amber-800 ${RING} ring-amber-200 hover:bg-amber-100`;
const OUTLINE_BLUE = `bg-white text-brand-blue-primary ${RING} ring-brand-blue-light/40 hover:bg-brand-blue-lighter`;
// Each action's light tint matches the status it leads to.
const TINT: Record<Tint, string> = {
  open: GREEN,
  resume: GREEN,
  pause: AMBER,
  publish: AMBER,
  close: `bg-slate-100 text-slate-700 ${RING} ring-slate-300 hover:bg-slate-200`,
  monitor: `bg-brand-blue-lighter text-brand-blue-primary ${RING} ring-brand-blue-light/30 hover:bg-brand-blue-lighter/60`,
  grade: `bg-violet-50 text-violet-700 ${RING} ring-violet-200 hover:bg-violet-100`,
  results: `bg-white text-slate-600 ${RING} ring-slate-300 hover:bg-slate-50`,
  reopen: OUTLINE_BLUE,
  'choose-class': OUTLINE_BLUE,
};
const BADGE: Record<AccessBadge['tone'], string> = {
  success: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
  neutral: 'bg-slate-200 text-slate-600',
};

const ICON = { width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' };
const BTN =
  'whitespace-nowrap rounded-lg font-bold transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_STYLE: React.CSSProperties = {
  paddingInline: 'min(12px, 2.6cqmin)',
  paddingBlock: 'min(6px, 1.4cqmin)',
  fontSize: 'min(12px, 3.5cqmin)',
};
const GREY_TEXT: React.CSSProperties = { fontSize: 'min(12.5px, 3.6cqmin)' };
// Title, chip and grey text share the first three tracks in the row and in its panel.
const ROW_GRID = `grid items-center grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_var(--asg-btn)_var(--asg-ic)_var(--asg-ic)] [@container(max-width:600px)]:grid-cols-[minmax(0,1fr)_auto_var(--asg-ic)_var(--asg-ic)]`;
const PANEL_GRID = `grid items-center grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_calc(var(--asg-btn)+2*var(--asg-ic)+2*var(--asg-gap))] [@container(max-width:600px)]:grid-cols-[minmax(0,1fr)_auto]`;
// The chip and grey text are two cells when wide and one wrapped line when narrow.
const STATUS_CELLS = `contents [@container(max-width:600px)]:col-span-full [@container(max-width:600px)]:row-start-2 [@container(max-width:600px)]:flex [@container(max-width:600px)]:flex-wrap [@container(max-width:600px)]:items-center`;

const Chip: React.FC<{ badge: AccessBadge }> = ({ badge }) => (
  <span className="flex min-w-0">
    <span
      className={`inline-flex min-w-0 items-center rounded-full font-bold uppercase tracking-wide ${BADGE[badge.tone]}`}
      style={{
        gap: 'min(4px, 1cqmin)',
        fontSize: 'min(10px, 3cqmin)',
        padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
      }}
    >
      {badge.dot && (
        <span
          aria-hidden="true"
          className="shrink-0 rounded-full bg-current"
          style={{ width: 'min(6px, 1.5cqmin)', height: 'min(6px, 1.5cqmin)' }}
        />
      )}
      <span className="truncate">{badge.label}</span>
    </span>
  </span>
);

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** One assignment on the Assigned tab: title, status chip, grey text and the next step. */
export const AssignedRow: React.FC<AssignedRowProps> = ({
  title,
  status,
  nowMs,
  mainLabel,
  onMain,
  mainBadgeCount,
  mainBadgeAriaLabel,
  detail,
  onClassAction,
  onResults,
  classControls = true,
  classCounts = true,
  canPause = true,
  mainTone,
  bellLabel,
  footer,
  meta,
  menuActions,
  busy = false,
  tourIndex,
  tourWidgetType,
  selected = false,
  onSelect,
  selectAnchor,
  hideCounts = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const select = useAssignedRowSelect();
  const focusLabel = useContext(AssignedFocusClassContext);
  const rowKey = `row-${tourIndex + 1}`;
  const done = status.bucket === 'done';
  const counts = classCounts && !hideCounts;
  // A class filter makes the row describe that class.
  const focus =
    focusLabel && !status.singleLine
      ? status.classes.find((c) => c.label === focusLabel)
      : undefined;
  const badge = focus ? classBadge(focus) : accessBadge(status);
  const grey = focus
    ? classDetailText(focus, nowMs, bellLabel?.(focus) ?? null, counts)
    : (detail ?? detailText(status, nowMs, counts));
  const toggle = () => setExpanded((v) => !v);
  const pick = () => {
    if (select) return select.toggle();
    onSelect?.();
    toggle();
  };
  const focusKind: ClassActionKind | null = !focus
    ? null
    : focus.status === 'open'
      ? 'monitor'
      : focus.status === 'paused'
        ? 'resume'
        : focus.status === 'closed'
          ? null
          : 'open';
  // A closed class keeps the assignment's own next step: Grade, Publish or nothing.
  const hostMain =
    !focus ||
    (focus.status === 'closed' &&
      ['grade', 'publish'].includes(status.action.kind));
  const label = focusKind
    ? CLASS_ACTION_LABEL[focusKind]
    : hostMain
      ? mainLabel
      : null;
  const tint: Tint = focusKind ?? mainTone ?? status.action.kind;
  const main = focusKind
    ? () => onClassAction(focusKind, focus?.key ?? null)
    : status.action.kind === 'choose-class'
      ? () => setExpanded(true)
      : onMain;
  const vars = {
    '--asg-btn': 'min(120px, 28cqmin)',
    '--asg-ic': 'min(30px, 8cqmin)',
    '--asg-gap': 'min(10px, 2.2cqmin)',
    '--asg-px': 'min(8px, 1.8cqmin)',
    '--asg-py': 'min(10px, 2.2cqmin)',
  } as React.CSSProperties;
  const open = expanded && !select;

  return (
    <div
      className={`border-b border-slate-200/60 last:border-b-0 ${selected || select?.selected ? 'bg-brand-blue-lighter/40' : ''}`}
      aria-current={selected || undefined}
      style={{ ...vars, padding: 'var(--asg-py) var(--asg-px)' }}
      aria-busy={busy || undefined}
    >
      <div className="flex items-center" style={{ gap: 'var(--asg-gap)' }}>
        {select && (
          <AssignedCheckbox
            state={select.selected ? 'on' : 'off'}
            onToggle={select.toggle}
            label={`Select ${title}`}
            anchor={tourFieldAttr(
              'library-shell.assigned-select-row',
              tourWidgetType,
              rowKey
            )}
          />
        )}
        {/* no-tour-anchor: same toggle as the classes button at the end of the row */}
        <div
          className={`min-w-0 flex-1 cursor-pointer ${ROW_GRID}`}
          style={{ columnGap: 'var(--asg-gap)', rowGap: 'min(4px, 1cqmin)' }}
          onClick={pick}
        >
          <div
            className={`min-w-0 [overflow-wrap:anywhere] ${done ? 'font-semibold text-slate-500' : 'font-bold text-brand-blue-dark'}`}
            style={{ fontSize: 'min(14px, 4.2cqmin)', lineHeight: 1.3 }}
            {...(onSelect
              ? {
                  ...selectAnchor,
                  role: 'button',
                  tabIndex: 0,
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    pick();
                  },
                }
              : {})}
          >
            {title}
          </div>
          <div className={STATUS_CELLS} style={{ gap: 'min(8px, 2cqmin)' }}>
            {badge ? <Chip badge={badge} /> : <span aria-hidden="true" />}
            <div
              className="flex min-w-0 flex-wrap items-center text-slate-500 tabular-nums"
              style={{ ...GREY_TEXT, columnGap: 'min(8px, 2cqmin)' }}
            >
              {grey && <span className="min-w-0">{grey}</span>}
              {meta}
            </div>
          </div>
          <div
            className={`relative flex justify-end [@container(max-width:600px)]:col-start-2 [@container(max-width:600px)]:row-start-1`}
            onClick={stop}
          >
            {label && !select && (
              <>
                <button
                  type="button"
                  onClick={main}
                  disabled={busy}
                  {...tourFieldAttr(
                    'library-shell.archive-primary-action',
                    tourWidgetType,
                    rowKey
                  )}
                  className={`w-full ${BTN} ${TINT[tint]}`}
                  style={BTN_STYLE}
                >
                  {label}
                  {!focusKind &&
                    mainBadgeCount != null &&
                    mainBadgeCount > 0 && (
                      <span className="sr-only">, {mainBadgeAriaLabel}</span>
                    )}
                </button>
                {!focusKind && mainBadgeCount != null && mainBadgeCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-1 ring-white"
                  >
                    {mainBadgeCount}
                  </span>
                )}
              </>
            )}
          </div>
          <div
            className={`flex justify-center [@container(max-width:600px)]:col-start-3 [@container(max-width:600px)]:row-start-1`}
            onClick={stop}
          >
            {!select && (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={expanded}
                aria-label={`Details for ${title}`}
                title="Details"
                {...tourFieldAttr(
                  'library-shell.assigned-classes',
                  tourWidgetType,
                  rowKey
                )}
                className="touch-target-expand relative flex shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-blue-primary"
                style={{ width: 'var(--asg-ic)', height: 'var(--asg-ic)' }}
              >
                {expanded ? (
                  <ChevronUp style={ICON} />
                ) : (
                  <ChevronDown style={ICON} />
                )}
              </button>
            )}
          </div>
          <div
            className={`flex justify-center [@container(max-width:600px)]:col-start-4 [@container(max-width:600px)]:row-start-1`}
            onClick={stop}
          >
            {!select && menuActions.length > 0 && (
              <OverflowMenu
                actions={menuActions}
                rowKey={rowKey}
                widgetType={tourWidgetType}
                archive
              />
            )}
          </div>
        </div>
      </div>

      {open && (
        <div
          className="border-t border-slate-200 bg-slate-50"
          style={{
            margin:
              'var(--asg-py) calc(-1 * var(--asg-px)) calc(-1 * var(--asg-py))',
            padding: 'min(4px, 1cqmin) var(--asg-px) min(6px, 1.4cqmin)',
          }}
        >
          {status.classes.map((c, ci) => {
            const text = classDetailText(
              c,
              nowMs,
              bellLabel?.(c) ?? null,
              counts
            );
            const actions = classControls
              ? classActions(c.status).filter((k) => k !== 'pause' || canPause)
              : [];
            return (
              <div
                key={c.key}
                className={`border-b border-slate-200/70 ${PANEL_GRID}`}
                style={{
                  columnGap: 'var(--asg-gap)',
                  rowGap: 'min(4px, 1cqmin)',
                  padding: 'min(7px, 1.6cqmin) 0',
                }}
              >
                <div
                  className="min-w-0 font-semibold text-brand-blue-dark [overflow-wrap:anywhere]"
                  style={{
                    fontSize: 'min(13px, 3.8cqmin)',
                    paddingLeft: 'min(14px, 3.2cqmin)',
                  }}
                >
                  {c.label || 'All students'}
                </div>
                <div
                  className={STATUS_CELLS}
                  style={{
                    gap: 'min(8px, 2cqmin)',
                    paddingLeft: 'min(14px, 3.2cqmin)',
                  }}
                >
                  <Chip badge={classBadge(c)} />
                  <div
                    className="min-w-0 text-slate-500 tabular-nums"
                    style={GREY_TEXT}
                  >
                    {text}
                  </div>
                </div>
                <div
                  className={`flex flex-wrap items-center [@container(max-width:600px)]:col-start-2 [@container(max-width:600px)]:row-start-1 [@container(max-width:600px)]:justify-end`}
                  style={{ gap: 'min(6px, 1.4cqmin)' }}
                >
                  {actions.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onClassAction(kind, status.singleLine ? null : c.key)
                      }
                      {...tourFieldAttr(
                        'library-shell.assigned-class-action',
                        tourWidgetType,
                        `${kind}-${ci + 1}`
                      )}
                      className={`${BTN} ${TINT[kind]}`}
                      style={BTN_STYLE}
                    >
                      {CLASS_ACTION_LABEL[kind]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div
            className={PANEL_GRID}
            style={{
              columnGap: 'var(--asg-gap)',
              padding: 'min(7px, 1.6cqmin) 0',
            }}
          >
            <p
              className={`col-span-3 min-w-0 text-slate-500 [@container(max-width:600px)]:col-span-1`}
              style={{ ...GREY_TEXT, paddingLeft: 'min(14px, 3.2cqmin)' }}
            >
              {footer?.join(' · ')}
            </p>
            <div className={`flex [@container(max-width:600px)]:justify-end`}>
              {onResults && (
                <button
                  type="button"
                  onClick={onResults}
                  {...tourFieldAttr(
                    'library-shell.assigned-results',
                    tourWidgetType,
                    rowKey
                  )}
                  className={`${BTN} ${TINT.results}`}
                  style={BTN_STYLE}
                >
                  Results
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
