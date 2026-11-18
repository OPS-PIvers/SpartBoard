import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { AssignedClass, AssignedStatus } from '@/utils/assignedStatus';
import { OverflowMenu } from '../LibraryOverflowMenu';
import type { LibraryMenuAction } from '../types';
import {
  CLASS_ACTION_LABEL,
  classActions,
  classDetail,
  statusLineSegments,
  type ClassActionKind,
  type LineSegment,
  type LineTone,
} from './assignedWording';

export interface AssignedRowProps {
  title: string;
  /** From `deriveAssignedStatus`; any assignment kind. */
  status: AssignedStatus;
  nowMs: number;
  /** The main button; `choose-class` rows expand instead of calling `onMain`. */
  mainLabel: string | null;
  onMain: () => void;
  mainBadgeCount?: number;
  mainBadgeAriaLabel?: string;
  /** Replaces the derived line, e.g. for paper quizzes. */
  lineOverride?: LineSegment[];
  /** False hides the per-class panel, e.g. for a paper quiz. */
  classControls?: boolean;
  /** A null key acts on the whole single-line assignment (D15). */
  onClassAction: (kind: ClassActionKind, classKey: string | null) => void;
  /** Today's bell time for a Ready class, e.g. "9:55 to 10:40". */
  bellLabel?: (c: AssignedClass) => string | null;
  /** Shown under the classes: how it closes, the assigned date and join code. */
  footer?: string[];
  /** Extra inline items after the status line (sync pill, skipped marker). */
  meta?: React.ReactNode;
  menuActions: LibraryMenuAction[];
  busy?: boolean;
  tourIndex: number;
  tourWidgetType: string;
}

const TONE_CLASS: Record<LineTone, string> = {
  open: 'text-emerald-700 font-bold',
  paused: 'text-amber-700 font-bold',
  alert: 'text-red-700 font-bold',
  warn: 'text-amber-700 font-bold',
  plain: '',
};

const ICON = { width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' };

/** Small hollow or filled marker for one class's status. */
const ClassMarker: React.FC<{ status: AssignedClass['status'] }> = ({
  status,
}) => {
  const color =
    status === 'open'
      ? 'text-emerald-600 bg-current'
      : status === 'paused'
        ? 'text-amber-600 bg-current'
        : status === 'closed'
          ? 'text-slate-400 bg-current'
          : 'text-brand-blue-dark';
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full border-[1.5px] border-current ${color} ${
        status === 'scheduled' ? 'border-dashed' : ''
      }`}
      style={{ width: 'min(8px, 2cqmin)', height: 'min(8px, 2cqmin)' }}
    />
  );
};

/** One assignment on the Assigned tab: title, one status line, one button (ASSIGNED_TAB.md D14). */
export const AssignedRow: React.FC<AssignedRowProps> = ({
  title,
  status,
  nowMs,
  mainLabel,
  onMain,
  mainBadgeCount,
  mainBadgeAriaLabel,
  lineOverride,
  onClassAction,
  classControls = true,
  bellLabel,
  footer,
  meta,
  menuActions,
  busy = false,
  tourIndex,
  tourWidgetType,
}) => {
  const [expanded, setExpanded] = useState(false);
  const rowKey = `row-${tourIndex + 1}`;
  const done = status.bucket === 'done';
  const canExpand = classControls && !status.singleLine;
  const live = status.classes.some((c) => c.status === 'open');
  const segments = lineOverride ?? statusLineSegments(status, nowMs);
  const toggle = () => {
    if (canExpand) setExpanded((v) => !v);
  };
  const main =
    status.action.kind === 'choose-class' && canExpand
      ? () => setExpanded(true)
      : onMain;

  return (
    <div
      className="border-b border-slate-200/60 last:border-b-0"
      style={{ padding: 'min(10px, 2.2cqmin) min(6px, 1.4cqmin)' }}
      aria-busy={busy || undefined}
    >
      <div className="flex items-center" style={{ gap: 'min(10px, 2.2cqmin)' }}>
        <div
          className="flex shrink-0 items-center justify-center"
          style={{ width: 'min(8px, 2cqmin)' }}
          aria-hidden="true"
        >
          {live && (
            <span
              className="rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
              style={{ width: 'min(8px, 2cqmin)', height: 'min(8px, 2cqmin)' }}
            />
          )}
        </div>
        {/* no-tour-anchor: same toggle as the classes button beside the main action */}
        <div
          className={`min-w-0 flex-1 ${canExpand ? 'cursor-pointer' : ''}`}
          onClick={toggle}
        >
          <div
            className={`truncate ${done ? 'font-semibold text-slate-500' : 'font-bold text-brand-blue-dark'}`}
            style={{ fontSize: 'min(14px, 4.2cqmin)' }}
            title={title}
          >
            {title}
          </div>
          <div
            className="flex flex-wrap items-center text-slate-500 tabular-nums"
            style={{
              columnGap: 'min(8px, 2cqmin)',
              rowGap: 'min(2px, 0.5cqmin)',
              fontSize: 'min(12.5px, 3.6cqmin)',
              marginTop: 'min(2px, 0.5cqmin)',
            }}
          >
            <span>
              {segments.map((seg, i) => (
                <React.Fragment key={i}>
                  {i > 0 && ' '}
                  <span className="whitespace-nowrap">
                    {i > 0 && !seg.glued && '· '}
                    <span className={TONE_CLASS[seg.tone]}>{seg.text}</span>
                  </span>
                </React.Fragment>
              ))}
            </span>
            {meta}
          </div>
        </div>
        {mainLabel && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={main}
              disabled={busy}
              {...tourFieldAttr(
                'library-shell.archive-primary-action',
                tourWidgetType,
                rowKey
              )}
              className="flex items-center justify-center whitespace-nowrap rounded-lg bg-brand-blue-primary font-bold text-white transition-all hover:bg-brand-blue-dark active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                minWidth: 'min(104px, 24cqmin)',
                paddingInline: 'min(12px, 2.6cqmin)',
                paddingBlock: 'min(7px, 1.6cqmin)',
                fontSize: 'min(12px, 3.5cqmin)',
              }}
            >
              {mainLabel}
              {mainBadgeCount != null && mainBadgeCount > 0 && (
                <span className="sr-only">, {mainBadgeAriaLabel}</span>
              )}
            </button>
            {mainBadgeCount != null && mainBadgeCount > 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-1 ring-white"
              >
                {mainBadgeCount}
              </span>
            )}
          </div>
        )}
        {canExpand ? (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-label={`Classes for ${title}`}
            title="Classes"
            {...tourFieldAttr(
              'library-shell.assigned-classes',
              tourWidgetType,
              rowKey
            )}
            className="touch-target-expand relative flex shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-blue-primary"
            style={{ width: 'min(30px, 8cqmin)', height: 'min(30px, 8cqmin)' }}
          >
            {expanded ? (
              <ChevronUp style={ICON} />
            ) : (
              <ChevronDown style={ICON} />
            )}
          </button>
        ) : (
          <div
            aria-hidden="true"
            className="shrink-0"
            style={{ width: 'min(30px, 8cqmin)' }}
          />
        )}
        {menuActions.length > 0 ? (
          <OverflowMenu
            actions={menuActions}
            rowKey={rowKey}
            widgetType={tourWidgetType}
            archive
          />
        ) : (
          <div
            aria-hidden="true"
            className="shrink-0"
            style={{ width: 'min(30px, 8cqmin)' }}
          />
        )}
      </div>

      {expanded && canExpand && (
        <div
          className="rounded-xl bg-slate-100"
          style={{
            marginTop: 'min(8px, 2cqmin)',
            marginLeft: 'min(18px, 4cqmin)',
            padding: 'min(6px, 1.4cqmin) min(8px, 2cqmin)',
          }}
        >
          {status.classes.map((c, ci) => (
            <div
              key={c.key}
              className="flex flex-wrap items-center"
              style={{
                gap: 'min(8px, 2cqmin)',
                padding: 'min(6px, 1.4cqmin) min(6px, 1.4cqmin)',
              }}
            >
              <ClassMarker status={c.status} />
              <div className="min-w-0 flex-1">
                <div
                  className="font-semibold text-brand-blue-dark [overflow-wrap:anywhere]"
                  style={{ fontSize: 'min(13px, 3.8cqmin)' }}
                >
                  {c.label}
                </div>
                <div
                  className="text-slate-500 tabular-nums"
                  style={{ fontSize: 'min(11.5px, 3.3cqmin)' }}
                >
                  {classDetail(c, nowMs, bellLabel?.(c) ?? null)}
                </div>
              </div>
              <div
                className="flex shrink-0 items-center"
                style={{ gap: 'min(6px, 1.4cqmin)' }}
              >
                {classActions(c.status).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    disabled={busy}
                    onClick={() => onClassAction(kind, c.key)}
                    {...tourFieldAttr(
                      'library-shell.assigned-class-action',
                      tourWidgetType,
                      `${kind}-${ci + 1}`
                    )}
                    className="whitespace-nowrap rounded-lg bg-brand-blue-lighter font-bold text-brand-blue-dark transition-colors hover:bg-brand-blue-light/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      paddingInline: 'min(12px, 2.6cqmin)',
                      paddingBlock: 'min(7px, 1.6cqmin)',
                      fontSize: 'min(12px, 3.5cqmin)',
                    }}
                  >
                    {CLASS_ACTION_LABEL[kind]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {footer && footer.length > 0 && (
            <p
              className="text-slate-500"
              style={{
                fontSize: 'min(11.5px, 3.3cqmin)',
                margin: 'min(4px, 1cqmin) min(6px, 1.4cqmin) min(4px, 1cqmin)',
              }}
            >
              {footer.join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
