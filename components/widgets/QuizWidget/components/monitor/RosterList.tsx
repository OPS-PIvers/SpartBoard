import React, { useState } from 'react';
import {
  AlertTriangle,
  Hand,
  ImageOff,
  Lock,
  MoreVertical,
  Unlock,
} from 'lucide-react';
import { QuizSession, QuizConfig } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { MonitorStudent } from './useMonitorData';
import { BucketKey } from './StatusBuckets';
import {
  MonitorFilterBy,
  MonitorSortBy,
  ProficiencyBand,
  compareStudents,
  matchesFilter,
} from './monitorUtils';

interface RosterListProps {
  bucket: BucketKey;
  students: MonitorStudent[];
  session: QuizSession;
  config: QuizConfig;
  isGamified: boolean;
  onUpdateConfig: (updates: Partial<QuizConfig>) => void;
  onRemove?: (key: string) => void;
  onUnlockAttempt?: (key: string) => void;
  onUnlockResults?: (key: string) => void;
  onClearHand?: (key: string) => void;
}

const BAND_TINT: Record<ProficiencyBand, string> = {
  hi: 'bg-emerald-50',
  mid: 'bg-amber-50',
  low: 'bg-orange-50',
  crit: 'bg-rose-50',
};

const fieldStyle = {
  fontSize: 'min(11px, 3.8cqmin)',
  padding: 'min(4px, 1cqmin) min(6px, 1.5cqmin)',
};

const ToggleChip: React.FC<{
  label: string;
  on: boolean;
  onToggle: () => void;
}> = ({ label, on, onToggle }) => (
  <button
    onClick={onToggle}
    aria-pressed={on}
    className={`rounded-md border font-sans font-medium transition-colors ${
      on
        ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
        : 'bg-white border-brand-gray-lighter text-brand-gray-dark hover:border-brand-blue-light'
    }`}
    style={fieldStyle}
  >
    {label}
  </button>
);

const RowMenu: React.FC<{
  student: MonitorStudent;
  session: QuizSession;
  onRemove?: (key: string) => void;
  onUnlockAttempt?: (key: string) => void;
  onUnlockResults?: (key: string) => void;
}> = ({ student, session, onRemove, onUnlockAttempt, onUnlockResults }) => {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  useClickOutside(menuRef, () => {
    setOpen(false);
    setConfirmRemove(false);
  });

  const r = student.response;
  const attemptLimit = session.attemptLimit;
  const locked =
    !r.unlocked &&
    ((r.status === 'completed' && (r.tabSwitchWarnings ?? 0) >= 3) ||
      (typeof attemptLimit === 'number' &&
        attemptLimit > 0 &&
        (r.completedAttempts ?? 0) >= attemptLimit));

  const items: { label: string; danger?: boolean; onClick: () => void }[] = [];
  if (locked && onUnlockAttempt)
    items.push({
      label: 'Unlock attempt',
      onClick: () => onUnlockAttempt(student.key),
    });
  if (r.resultsLockedOut && onUnlockResults)
    items.push({
      label: 'Unlock results',
      onClick: () => onUnlockResults(student.key),
    });
  if (onRemove)
    items.push({
      label: confirmRemove ? 'Confirm remove' : 'Remove student',
      danger: true,
      onClick: () => {
        if (!confirmRemove) {
          setConfirmRemove(true);
          return;
        }
        onRemove(student.key);
        setOpen(false);
        setConfirmRemove(false);
      },
    });
  if (items.length === 0) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Actions for ${student.name}`}
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
          {items.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
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
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const RosterList: React.FC<RosterListProps> = ({
  bucket,
  students,
  session,
  config,
  isGamified,
  onUpdateConfig,
  onRemove,
  onUnlockAttempt,
  onUnlockResults,
  onClearHand,
}) => {
  const showToolbar = bucket !== 'notStarted';
  const showScores = (config.monitorShowScores ?? false) && bucket === 'done';
  const tabWarningsAllowed = session.tabWarningsEnabled !== false;
  const showTabs =
    (config.monitorShowTabWarnings ?? false) && tabWarningsAllowed;
  const showProf =
    (config.monitorShowProficiency ?? false) && bucket === 'done';
  const sortBy: MonitorSortBy = config.monitorSortBy ?? 'first';
  const filterBy: MonitorFilterBy = config.monitorFilterBy ?? 'all';

  const needsHelp =
    bucket === 'inProgress' ? students.filter((s) => s.needsHelp) : [];
  const needsHelpKeys = new Set(needsHelp.map((s) => s.key));
  const rest = students
    .filter((s) => !needsHelpKeys.has(s.key))
    .filter((s) =>
      showToolbar
        ? matchesFilter(
            {
              name: s.name,
              status: s.response.status,
              score: s.bandScore,
              tabWarnings: s.tabWarnings,
            },
            filterBy
          )
        : true
    )
    .sort((a, b) =>
      compareStudents(
        {
          name: a.name,
          status: a.response.status,
          score: a.bandScore,
          tabWarnings: a.tabWarnings,
        },
        {
          name: b.name,
          status: b.response.status,
          score: b.bandScore,
          tabWarnings: b.tabWarnings,
        },
        showToolbar ? sortBy : 'first'
      )
    );

  return (
    <div
      className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-200"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      {showToolbar && (
        <div
          className="flex flex-wrap items-center"
          style={{ gap: 'min(6px, 1.5cqmin)' }}
        >
          {bucket === 'done' && (
            <ToggleChip
              label="Scores"
              on={config.monitorShowScores ?? false}
              onToggle={() =>
                onUpdateConfig({
                  monitorShowScores: !(config.monitorShowScores ?? false),
                })
              }
            />
          )}
          {tabWarningsAllowed && (
            <ToggleChip
              label="Tab warnings"
              on={config.monitorShowTabWarnings ?? false}
              onToggle={() =>
                onUpdateConfig({
                  monitorShowTabWarnings: !(
                    config.monitorShowTabWarnings ?? false
                  ),
                })
              }
            />
          )}
          {bucket === 'done' && (
            <ToggleChip
              label="Proficiency colors"
              on={config.monitorShowProficiency ?? false}
              onToggle={() =>
                onUpdateConfig({
                  monitorShowProficiency: !(
                    config.monitorShowProficiency ?? false
                  ),
                })
              }
            />
          )}
          <select
            value={sortBy}
            onChange={(e) =>
              onUpdateConfig({ monitorSortBy: e.target.value as MonitorSortBy })
            }
            aria-label="Sort students"
            className="rounded-md border border-brand-gray-lighter bg-white text-brand-gray-dark font-sans"
            style={fieldStyle}
          >
            <option value="first">First name</option>
            <option value="last">Last name</option>
            <option value="status">Status</option>
            <option value="score">Score</option>
          </select>
          <select
            value={filterBy}
            onChange={(e) =>
              onUpdateConfig({
                monitorFilterBy: e.target.value as MonitorFilterBy,
              })
            }
            aria-label="Filter students"
            className="rounded-md border border-brand-gray-lighter bg-white text-brand-gray-dark font-sans"
            style={fieldStyle}
          >
            <option value="all">Everyone</option>
            <option value="hi">Score 80%+</option>
            <option value="mid">Score 60–79%</option>
            <option value="low">Below 60%</option>
            <option value="tabs">Left quiz tab</option>
          </select>
        </div>
      )}

      {needsHelp.map((s) => (
        <div
          key={s.key}
          className="flex items-center justify-between bg-red-50 rounded-lg"
          style={{
            padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
            gap: 'min(8px, 2cqmin)',
          }}
        >
          <div
            className="flex items-center min-w-0"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <Hand
              className="text-brand-red-primary shrink-0"
              aria-hidden
              style={{
                width: 'min(14px, 4.5cqmin)',
                height: 'min(14px, 4.5cqmin)',
              }}
            />
            <div className="min-w-0">
              <p
                className="font-sans font-semibold text-brand-gray-dark truncate"
                style={{ fontSize: 'min(13px, 4.5cqmin)' }}
              >
                {s.name}
              </p>
              <p
                className="text-brand-red-primary"
                style={{ fontSize: 'min(10px, 3.5cqmin)' }}
              >
                {s.needsHelp?.kind === 'hand'
                  ? `Raised hand · Q${s.onQuestion}`
                  : `No activity ${Math.max(s.needsHelp?.minutes ?? 2, 2)} min · Q${s.onQuestion}`}
              </p>
            </div>
          </div>
          {s.needsHelp?.kind === 'hand' && onClearHand && (
            <button
              onClick={() => onClearHand(s.key)}
              className="shrink-0 rounded-md border border-brand-red-light text-brand-red-primary hover:bg-brand-red-primary hover:text-white font-sans font-medium transition-colors"
              style={fieldStyle}
            >
              Clear
            </button>
          )}
        </div>
      ))}

      {rest.length === 0 && needsHelp.length === 0 && (
        <p
          className="text-brand-gray-primary text-center"
          style={{ fontSize: 'min(12px, 4cqmin)', padding: 'min(8px, 2cqmin)' }}
        >
          {students.length === 0
            ? 'No students here yet.'
            : 'No students match this filter.'}
        </p>
      )}

      {rest.map((s) => {
        const r = s.response;
        const tint = showProf && s.band ? BAND_TINT[s.band] : 'bg-white';
        const locked =
          !r.unlocked &&
          ((r.status === 'completed' && (r.tabSwitchWarnings ?? 0) >= 3) ||
            (typeof session.attemptLimit === 'number' &&
              session.attemptLimit > 0 &&
              (r.completedAttempts ?? 0) >= session.attemptLimit));
        return (
          <div
            key={s.key}
            className={`flex items-center justify-between rounded-lg border border-brand-gray-lightest ${tint}`}
            style={{
              padding: 'min(7px, 1.8cqmin) min(10px, 2.5cqmin)',
              gap: 'min(8px, 2cqmin)',
            }}
          >
            <div
              className="flex items-center min-w-0"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              <p
                className="font-sans font-medium text-brand-gray-dark truncate"
                style={{ fontSize: 'min(13px, 4.5cqmin)' }}
              >
                {s.name}
              </p>
              {s.duplicate && (
                <span
                  className="shrink-0 text-brand-red-primary font-sans"
                  title="Possible duplicate identity"
                  style={{ fontSize: 'min(9px, 3cqmin)' }}
                >
                  duplicate?
                </span>
              )}
            </div>
            <div
              className="flex items-center shrink-0"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              {bucket === 'inProgress' && (
                <span
                  className="text-brand-gray-primary tabular-nums"
                  style={{ fontSize: 'min(11px, 3.8cqmin)' }}
                >
                  Q{s.onQuestion}
                </span>
              )}
              {Object.keys(r.stimulusErrors ?? {}).length > 0 && (
                <ImageOff
                  className="text-amber-600"
                  aria-label="Stimulus failed to load for this student"
                  style={{
                    width: 'min(12px, 4cqmin)',
                    height: 'min(12px, 4cqmin)',
                  }}
                />
              )}
              {showTabs && s.tabWarnings > 0 && (
                <span
                  className="inline-flex items-center text-brand-red-primary font-sans font-semibold tabular-nums"
                  title={`${s.tabWarnings} tab-switch warning${s.tabWarnings === 1 ? '' : 's'}`}
                  style={{
                    gap: 'min(2px, 0.5cqmin)',
                    fontSize: 'min(11px, 3.8cqmin)',
                  }}
                >
                  <AlertTriangle
                    aria-hidden
                    style={{
                      width: 'min(12px, 4cqmin)',
                      height: 'min(12px, 4cqmin)',
                    }}
                  />
                  {s.tabWarnings}
                </span>
              )}
              {locked && (
                <Lock
                  className="text-brand-gray-primary"
                  aria-label="Locked"
                  style={{
                    width: 'min(12px, 4cqmin)',
                    height: 'min(12px, 4cqmin)',
                  }}
                />
              )}
              {r.unlocked && r.status !== 'completed' && (
                <Unlock
                  className="text-emerald-600"
                  aria-label="Resumed after unlock"
                  style={{
                    width: 'min(12px, 4cqmin)',
                    height: 'min(12px, 4cqmin)',
                  }}
                />
              )}
              {showScores &&
                (s.displayScore != null ? (
                  <span
                    className={`rounded-full font-sans font-semibold tabular-nums ${
                      s.awaitingGrade
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-brand-blue-lighter text-brand-blue-dark'
                    }`}
                    title={
                      s.awaitingGrade
                        ? 'Provisional — a written response is still ungraded, so this total will change.'
                        : undefined
                    }
                    style={{
                      fontSize: 'min(11px, 3.8cqmin)',
                      padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
                    }}
                  >
                    {s.displayScore}
                    {isGamified ? ' pts' : '%'}
                    {s.awaitingGrade && (
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
                ))}
              <RowMenu
                student={s}
                session={session}
                onRemove={onRemove}
                onUnlockAttempt={onUnlockAttempt}
                onUnlockResults={onUnlockResults}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
