import React, { useLayoutEffect, useRef, useState } from 'react';
import { proficiencyLevel } from '@/utils/gradebook/gradebookCore';
import { average } from '@/utils/gradebook/gradebookModel';
import { spaNavigate } from '@/utils/plcPath';
import { buildGradebookPath } from '@/utils/gradebookPath';
import { useGradebook, type GradebookColumn } from './GradebookContext';
import { GradebookCellContent } from './GradebookCellContent';
import { BAND_TEXT, cellAnchorId, cellAriaLabel } from './cellFormat';
import { GRADEBOOK_KIND_META } from './kindMeta';
import { Private } from './Private';
import { GradebookPopovers } from './GradebookPopovers';

interface Focus {
  sessionId: string;
  uid: string;
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

const HATCH =
  'bg-[repeating-linear-gradient(135deg,theme(colors.slate.100)_0_6px,transparent_6px_12px)]';

const isTyping = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement &&
  (el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** The class grid (D19, D20, D23): frozen name and Overall columns, keyboard-driven cells. */
export const GradebookGrid: React.FC = () => {
  const gb = useGradebook();
  const {
    rosterId,
    students,
    columns,
    getCell,
    overall,
    view,
    setView,
    settings,
    scale,
    popover,
    openCell,
    openHeader,
    marks,
  } = gb;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<Focus | null>(null);

  // Open on the newest assignments (D19); re-run when the class changes.
  const scrolledFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || columns.length === 0 || scrolledFor.current === rosterId) return;
    scrolledFor.current = rosterId;
    el.scrollLeft = el.scrollWidth;
  }, [rosterId, columns.length]);

  const focusCell = (next: Focus) => {
    setFocus(next);
    const el = wrapRef.current?.querySelector<HTMLElement>(
      `[data-gb-cell="${CSS.escape(cellAnchorId(next.sessionId, next.uid))}"]`
    );
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const active =
    focus &&
    columns.some((c) => c.sessionId === focus.sessionId) &&
    students.some((s) => s.uid === focus.uid)
      ? focus
      : columns.length && students.length
        ? {
            sessionId: columns[columns.length - 1].sessionId,
            uid: students[0].uid,
          }
        : null;

  const move = (dRow: number, dCol: number) => {
    if (!active) return;
    const r = students.findIndex((s) => s.uid === active.uid);
    const c = columns.findIndex((x) => x.sessionId === active.sessionId);
    const nr = Math.min(students.length - 1, Math.max(0, r + dRow));
    const nc = Math.min(columns.length - 1, Math.max(0, c + dCol));
    focusCell({ sessionId: columns[nc].sessionId, uid: students[nr].uid });
  };

  const flagByKey = new Map(
    settings.flags
      .filter((f) => f.visibility !== 'off')
      .map((f) => [f.key.toUpperCase(), f.id])
  );

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (!target.dataset?.gbCell || isTyping(target) || !active) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (arrows[e.key]) {
      e.preventDefault();
      move(...arrows[e.key]);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      openCell(active.sessionId, active.uid);
      return;
    }
    if (/^[0-9.]$/.test(e.key)) {
      e.preventDefault();
      openCell(active.sessionId, active.uid, e.key);
      return;
    }
    const flagId = flagByKey.get(e.key.toUpperCase());
    if (flagId && e.key.length === 1) {
      e.preventDefault();
      void marks.toggleFlag(active.sessionId, active.uid, flagId);
    }
  };

  const onPopoverClose = () => {
    const p = popover;
    gb.closePopover();
    if (p?.type === 'cell') {
      focusCell({ sessionId: p.sessionId, uid: p.studentUid });
    }
  };

  const sortName = () => {
    const s = view.sort;
    const nameKey = view.nameFormat === 'first-last' ? 'first' : 'last';
    if (s.key === 'last' || s.key === 'first') {
      setView({
        sort: {
          key: nameKey,
          dir: s.dir === 'asc' ? 'desc' : 'asc',
          ref: null,
        },
      });
    } else {
      setView({ sort: { key: nameKey, dir: 'asc', ref: null } });
    }
  };
  const sortOverall = () => {
    const s = view.sort;
    setView({
      sort: {
        key: 'overall',
        dir: s.key === 'overall' && s.dir === 'desc' ? 'asc' : 'desc',
        ref: null,
      },
    });
  };

  const nameSorted = view.sort.key === 'last' || view.sort.key === 'first';
  const colAverage = (c: GradebookColumn): string => {
    if (c.completionOnly) {
      const n = students.filter(
        (s) => getCell(c.sessionId, s.uid).final.status === 'complete'
      ).length;
      return `${n}/${students.length}`;
    }
    const avg = average(
      students.map((s) => {
        const f = getCell(c.sessionId, s.uid).final;
        return f.status === 'scored' && f.counts ? f.pct : null;
      })
    );
    return avg === null ? '–' : `${Math.round(avg)}%`;
  };
  const classOverall = average(students.map((s) => overall(s.uid).pct));

  const th = 'border-b border-r border-slate-100 bg-white p-0';
  const stickyName =
    'sticky left-0 w-[200px] min-w-[200px] max-w-[200px] text-left';
  const stickyOverall =
    'sticky left-[200px] w-[88px] min-w-[88px] border-r-slate-200 shadow-[4px_0_6px_-4px_rgba(29,42,93,.12)]';

  return (
    <div
      ref={wrapRef}
      className="min-h-0 flex-1 scroll-pb-12 scroll-pl-[288px] scroll-pt-24 overflow-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(29,42,93,.06),0_1px_3px_rgba(29,42,93,.08)]"
      onKeyDown={onGridKeyDown}
    >
      <table className="min-w-full border-separate border-spacing-0 tabular-nums">
        <thead>
          <tr>
            <th
              className={`${th} ${stickyName} sticky top-0 z-30 border-b-slate-200 bg-slate-50 align-bottom`}
            >
              <button
                type="button"
                onClick={sortName}
                className="inline-flex items-center gap-1 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-brand-blue-primary"
                title="Sort by name"
              >
                Student
                {nameSorted && (
                  <small className="font-semibold normal-case text-slate-400">
                    {view.sort.dir === 'asc' ? 'A–Z' : 'Z–A'}
                  </small>
                )}
              </button>
            </th>
            <th
              className={`${th} ${stickyOverall} sticky top-0 z-30 border-b-slate-200 bg-slate-50 align-bottom`}
            >
              <button
                type="button"
                onClick={sortOverall}
                className="w-full px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-brand-blue-primary"
                title="Sort by overall"
              >
                Overall
                {view.sort.key === 'overall' &&
                  (view.sort.dir === 'desc' ? ' ↓' : ' ↑')}
              </button>
            </th>
            {columns.map((c) => {
              const Icon = GRADEBOOK_KIND_META[c.kind].icon;
              const open =
                popover?.type === 'header' && popover.sessionId === c.sessionId;
              return (
                <th
                  key={c.sessionId}
                  className={`${th} sticky top-0 z-20 border-b-slate-200 bg-slate-50 align-bottom`}
                >
                  <button
                    type="button"
                    data-gb-head={c.sessionId}
                    onClick={() => openHeader(c.sessionId)}
                    aria-expanded={open}
                    aria-haspopup="dialog"
                    className={`flex w-28 flex-col gap-1 px-2.5 py-2.5 text-left ${
                      open ? 'bg-brand-blue-lighter' : 'hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex min-h-[18px] items-center gap-1.5">
                      <span
                        className="grid h-[18px] w-[22px] place-items-center rounded-full bg-slate-200 text-slate-600"
                        title={GRADEBOOK_KIND_META[c.kind].label}
                      >
                        <Icon className="h-3 w-3" aria-hidden />
                      </span>
                      {c.hasUnpublished && (
                        <span
                          className="h-[7px] w-[7px] rounded-full bg-amber-600"
                          title="Not published"
                        />
                      )}
                    </span>
                    <span className="line-clamp-2 text-[12.5px] font-semibold leading-tight text-slate-800 [text-wrap:balance]">
                      {c.title}
                    </span>
                    <span className="text-[11px] font-normal text-slate-500">
                      {c.dueAt ? dateFmt.format(c.dueAt) : ' '}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const o = overall(s.uid);
            const level = view.tint ? proficiencyLevel(o.pct, scale) : null;
            return (
              <tr key={s.uid} className="group">
                <th
                  scope="row"
                  className={`${th} ${stickyName} z-10 px-3.5 py-1 font-normal group-hover:bg-slate-50`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      spaNavigate(
                        buildGradebookPath(rosterId, 'student', s.uid)
                      )
                    }
                    className="block max-w-full truncate text-left text-sm font-medium text-slate-800 hover:text-brand-blue-primary hover:underline"
                  >
                    <Private>{s.displayName}</Private>
                  </button>
                  {s.missing > 0 && (
                    <span className="block text-[11px] font-medium text-brand-red-primary">
                      {s.missing} missing
                    </span>
                  )}
                </th>
                <td
                  className={`${th} ${stickyOverall} z-10 text-center text-sm font-bold text-slate-900 group-hover:bg-slate-50`}
                >
                  <Private className={level !== null ? BAND_TEXT[level] : ''}>
                    {o.pct === null ? '–' : `${o.pct.toFixed(1)}%`}
                  </Private>
                </td>
                {columns.map((c) => {
                  const cell = getCell(c.sessionId, s.uid);
                  const isActive =
                    active?.sessionId === c.sessionId && active.uid === s.uid;
                  const na = cell.final.status === 'not-assigned';
                  return (
                    <td
                      key={c.sessionId}
                      className={`${th} group-hover:bg-slate-50`}
                    >
                      <button
                        type="button"
                        data-gb-cell={cellAnchorId(c.sessionId, s.uid)}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => {
                          setFocus({ sessionId: c.sessionId, uid: s.uid });
                          openCell(c.sessionId, s.uid);
                        }}
                        onFocus={() =>
                          setFocus({ sessionId: c.sessionId, uid: s.uid })
                        }
                        aria-label={cellAriaLabel(
                          s.displayName,
                          c,
                          cell,
                          view.cellFormat
                        )}
                        title={na ? 'Not assigned' : undefined}
                        className={`relative grid h-[46px] w-28 place-items-center text-sm font-medium text-slate-800 hover:shadow-[inset_0_0_0_2px_theme(colors.slate.200)] focus:outline-none focus:shadow-[inset_0_0_0_2px_theme(colors.brand.blue.primary)] ${
                          na ? HATCH : ''
                        }`}
                      >
                        {!na && <GradebookCellContent cell={cell} column={c} />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="text-xs font-semibold text-slate-600">
            <th
              scope="row"
              className={`${stickyName} sticky bottom-0 z-30 border-t border-slate-200 bg-slate-50 px-2 py-2.5`}
            >
              Class average
            </th>
            <td
              className={`${stickyOverall} sticky bottom-0 z-30 border-t border-slate-200 bg-slate-50 py-2.5 text-center`}
            >
              <Private>
                {classOverall === null ? '–' : `${Math.round(classOverall)}%`}
              </Private>
            </td>
            {columns.map((c) => (
              <td
                key={c.sessionId}
                className="sticky bottom-0 z-20 border-r border-t border-slate-100 border-t-slate-200 bg-slate-50 py-2.5 text-center"
              >
                <Private>{colAverage(c)}</Private>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      <GradebookPopovers onCellClose={onPopoverClose} />
    </div>
  );
};
