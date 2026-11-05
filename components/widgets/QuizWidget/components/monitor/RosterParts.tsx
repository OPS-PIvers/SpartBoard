import React, { useState } from 'react';
import { Clock, MoreVertical } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { tourTypeAttr, type TourAnchorAttrs } from '@/config/tourAnchors';
import type { BucketKey } from './StatusBuckets';
import type { MonitorFilterBy, MonitorSortBy } from './monitorUtils';
import {
  rosterFieldStyle,
  rosterIconSize,
  type MonitorRosterPrefs,
} from './rosterStyles';

export interface RosterToolbarAnchors {
  scores: TourAnchorAttrs;
  tabWarnings: TourAnchorAttrs;
  proficiency: TourAnchorAttrs;
  sort: TourAnchorAttrs;
  filter: TourAnchorAttrs;
}

const QUIZ_TOOLBAR_ANCHORS: RosterToolbarAnchors = {
  scores: tourTypeAttr('quiz-monitor.roster-scores', 'quiz'),
  tabWarnings: tourTypeAttr('quiz-monitor.roster-tab-warnings', 'quiz'),
  proficiency: tourTypeAttr('quiz-monitor.roster-proficiency', 'quiz'),
  sort: tourTypeAttr('quiz-monitor.roster-sort', 'quiz'),
  filter: tourTypeAttr('quiz-monitor.roster-filter', 'quiz'),
};

const ToggleChip: React.FC<{
  label: string;
  on: boolean;
  onToggle: () => void;
  anchor?: TourAnchorAttrs;
}> = ({ label, on, onToggle, anchor }) => (
  <button
    {...anchor}
    onClick={onToggle}
    aria-pressed={on}
    className={`rounded-md border font-sans font-medium transition-colors ${
      on
        ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
        : 'bg-white border-brand-gray-lighter text-brand-gray-dark hover:border-brand-blue-light'
    }`}
    style={rosterFieldStyle}
  >
    {label}
  </button>
);

/** Scores, Tab warnings and Proficiency colors switches plus Sort and Filter. */
export const RosterToolbar: React.FC<{
  bucket: BucketKey;
  prefs: MonitorRosterPrefs;
  onUpdate: (updates: Partial<MonitorRosterPrefs>) => void;
  tabWarningsAllowed: boolean;
  /** False hides Scores and Proficiency colors, e.g. where every row already shows a percent. */
  scoreSwitches?: boolean;
  anchors?: RosterToolbarAnchors;
}> = ({
  bucket,
  prefs,
  onUpdate,
  tabWarningsAllowed,
  scoreSwitches = true,
  anchors = QUIZ_TOOLBAR_ANCHORS,
}) => {
  const sortBy: MonitorSortBy = prefs.monitorSortBy ?? 'first';
  const filterBy: MonitorFilterBy = prefs.monitorFilterBy ?? 'all';
  return (
    <div
      className="flex flex-wrap items-center"
      style={{ gap: 'min(6px, 1.5cqmin)' }}
    >
      {scoreSwitches && bucket === 'done' && (
        <ToggleChip
          label="Scores"
          anchor={anchors.scores}
          on={prefs.monitorShowScores ?? false}
          onToggle={() =>
            onUpdate({ monitorShowScores: !(prefs.monitorShowScores ?? false) })
          }
        />
      )}
      {tabWarningsAllowed && (
        <ToggleChip
          label="Tab warnings"
          anchor={anchors.tabWarnings}
          on={prefs.monitorShowTabWarnings ?? false}
          onToggle={() =>
            onUpdate({
              monitorShowTabWarnings: !(prefs.monitorShowTabWarnings ?? false),
            })
          }
        />
      )}
      {scoreSwitches && bucket === 'done' && (
        <ToggleChip
          label="Proficiency colors"
          anchor={anchors.proficiency}
          on={prefs.monitorShowProficiency ?? false}
          onToggle={() =>
            onUpdate({
              monitorShowProficiency: !(prefs.monitorShowProficiency ?? false),
            })
          }
        />
      )}
      <select
        value={sortBy}
        onChange={(e) =>
          onUpdate({ monitorSortBy: e.target.value as MonitorSortBy })
        }
        aria-label="Sort students"
        {...anchors.sort}
        className="rounded-md border border-brand-gray-lighter bg-white text-brand-gray-dark font-sans"
        style={rosterFieldStyle}
      >
        <option value="first">First name</option>
        <option value="last">Last name</option>
        <option value="status">Status</option>
        <option value="score">Score</option>
      </select>
      <select
        value={filterBy}
        onChange={(e) =>
          onUpdate({ monitorFilterBy: e.target.value as MonitorFilterBy })
        }
        aria-label="Filter students"
        {...anchors.filter}
        className="rounded-md border border-brand-gray-lighter bg-white text-brand-gray-dark font-sans"
        style={rosterFieldStyle}
      >
        <option value="all">Everyone</option>
        <option value="hi">Score 80%+</option>
        <option value="mid">Score 60–79%</option>
        <option value="low">Below 60%</option>
        {tabWarningsAllowed && <option value="tabs">Left quiz tab</option>}
      </select>
    </div>
  );
};

export interface RosterMenuItem {
  label: string;
  danger?: boolean;
  /** Asks again in the menu with this label before running. */
  confirmLabel?: string;
  /** Closes the menu after running. */
  closes?: boolean;
  tour: TourAnchorAttrs;
  onClick: () => void;
}

/** A student row's vertical-dots menu; renders nothing without items. */
export const RosterRowMenu: React.FC<{
  ariaLabel: string;
  triggerAnchor: TourAnchorAttrs;
  items: RosterMenuItem[];
}> = ({ ariaLabel, triggerAnchor, items }) => {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  useClickOutside(menuRef, () => {
    setOpen(false);
    setConfirming(null);
  });
  if (items.length === 0) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        {...triggerAnchor}
        className="rounded-md text-brand-gray-primary hover:bg-brand-gray-lightest hover:text-brand-blue-dark transition-colors"
        style={{ padding: 'min(4px, 1cqmin)' }}
      >
        <MoreVertical
          style={{
            width: 'min(14px, 4.5cqmin)',
            height: 'min(14px, 4.5cqmin)',
          }}
        />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 bg-white border border-brand-gray-lighter rounded-lg shadow-lg overflow-hidden"
          style={{
            marginTop: 'min(4px, 1cqmin)',
            minWidth: 'min(160px, 55cqw)',
          }}
        >
          {items.map((item) => {
            const asking = item.confirmLabel && confirming === item.label;
            return (
              <button
                key={item.label}
                onClick={() => {
                  if (item.confirmLabel && !asking) {
                    setConfirming(item.label);
                    return;
                  }
                  item.onClick();
                  if (item.closes || item.confirmLabel) {
                    setOpen(false);
                    setConfirming(null);
                  }
                }}
                {...item.tour}
                className={`block w-full text-left font-sans transition-colors ${
                  item.danger
                    ? 'text-brand-red-primary hover:bg-red-50'
                    : 'text-brand-gray-dark hover:bg-brand-blue-lighter'
                }`}
                style={{
                  fontSize: 'min(12px, 4cqmin)',
                  padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
                }}
              >
                {asking ? item.confirmLabel : item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const rowPadding = {
  padding: 'min(7px, 1.8cqmin) min(10px, 2.5cqmin)',
  gap: 'min(8px, 2cqmin)',
};

/** One student row: name on the left, badges and the menu on the right, optional lines below. */
export const RosterRow: React.FC<{
  name: string;
  tint?: string;
  /** Shown after the name in red, e.g. "duplicate?". */
  nameNote?: React.ReactNode;
  children: React.ReactNode;
  below?: React.ReactNode;
  rowAttrs?: TourAnchorAttrs;
}> = ({ name, tint = 'bg-white', nameNote, children, below, rowAttrs }) => {
  const line = (
    <>
      <div
        className="flex items-center min-w-0"
        style={{ gap: 'min(6px, 1.5cqmin)' }}
      >
        <p
          className="font-sans font-medium text-brand-gray-dark truncate"
          style={{ fontSize: 'min(13px, 4.5cqmin)' }}
        >
          {name}
        </p>
        {nameNote}
      </div>
      <div
        className="flex items-center shrink-0"
        style={{ gap: 'min(6px, 1.5cqmin)' }}
      >
        {children}
      </div>
    </>
  );
  if (below == null)
    return (
      <div
        {...rowAttrs}
        className={`flex items-center justify-between rounded-lg border border-brand-gray-lightest ${tint}`}
        style={rowPadding}
      >
        {line}
      </div>
    );
  return (
    <div
      className={`flex flex-col rounded-lg border border-brand-gray-lightest ${tint}`}
    >
      <div
        {...rowAttrs}
        className="flex items-center justify-between"
        style={rowPadding}
      >
        {line}
      </div>
      {below}
    </div>
  );
};

/** Score pill shown when Scores is on; a dash when the student has no score. */
export const RosterScorePill: React.FC<{
  score: number | null;
  suffix: string;
  awaitingGrade?: boolean;
}> = ({ score, suffix, awaitingGrade = false }) =>
  score != null ? (
    <span
      className={`rounded-full font-sans font-semibold tabular-nums ${
        awaitingGrade
          ? 'bg-amber-100 text-amber-800'
          : 'bg-brand-blue-lighter text-brand-blue-dark'
      }`}
      title={
        awaitingGrade
          ? 'Provisional — a written response is still ungraded, so this total will change.'
          : undefined
      }
      style={{
        fontSize: 'min(11px, 3.8cqmin)',
        padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
      }}
    >
      {score}
      {suffix}
      {awaitingGrade && (
        <span aria-label="provisional, not fully graded">*</span>
      )}
    </span>
  ) : (
    <span
      className="text-brand-gray-light"
      style={{ fontSize: 'min(11px, 3.8cqmin)' }}
    >
      —
    </span>
  );

/** Minutes without an answer, shown when names are not hidden for the board. */
export const RosterIdleChip: React.FC<{ minutes: number }> = ({ minutes }) => (
  <span
    className="inline-flex items-center text-amber-700 font-sans tabular-nums"
    title={`No answer for ${minutes} min`}
    aria-label={`Idle ${minutes} min`}
    style={{ gap: 'min(2px, 0.5cqmin)', fontSize: 'min(11px, 3.8cqmin)' }}
  >
    <Clock aria-hidden style={rosterIconSize} />
    {minutes} min
  </span>
);

/** "Q3" in the In progress list: the question the student is on. */
export const RosterOnQuestion: React.FC<{ index: number }> = ({ index }) => (
  <span
    className="text-brand-gray-primary tabular-nums"
    style={{ fontSize: 'min(11px, 3.8cqmin)' }}
  >
    Q{index}
  </span>
);
