import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Eye,
  EyeOff,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Lock,
  Printer,
  RefreshCw,
} from 'lucide-react';
import type {
  FlashcardAssignment,
  FlashcardSession,
  QuizResponse,
  QuizScoreVisibility,
  SpeakLanguage,
  StaffResponseFields,
  Toast,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useViewAsOutward, VIEW_AS_WRITES } from '@/hooks/useViewAsOutward';
import { QuizDriveService } from '@/utils/quizDriveService';
import { logError } from '@/utils/logError';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ScorePill, SessionBadge } from '@/components/common/sessionViews';
import { resolveFlashcardResultsVisibility } from '@/utils/flashcardResultsVisibility';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import {
  buildCheckRows,
  checkCardAccuracy,
  type FlashcardResultRecord,
} from '@/utils/flashcardResults';
import {
  flashcardGradeFn,
  flashcardQuizData,
  flashcardQuizResponse,
} from '@/utils/flashcardQuizShape';
import { computeStudentDrilldown } from '@/utils/quizStudentDrilldown';
import {
  ResultsDrillRow,
  ResultsSummaryCard,
  ScoreDistributionBars,
} from '@/components/widgets/QuizWidget/components/results/ResultsHome';
import { SegmentedToggle } from '@/components/widgets/QuizWidget/components/results/SegmentedToggle';
import { StudentAnswerLine } from '@/components/widgets/QuizWidget/components/results/StudentAnswerLine';
import {
  ResultsPrintModal,
  type ResultsPrintToggle,
} from '@/components/widgets/QuizWidget/components/ResultsPrintModal';
import { FlashcardSpeakResults } from './FlashcardSpeakResults';
import {
  FlashcardCardAccuracyList,
  FlashcardCardDetail,
  FlashcardCardList,
} from './FlashcardCardResults';
import {
  ResultsOverrideBadge,
  StudentResultsControl,
} from '@/components/widgets/QuizWidget/components/results/StudentResultsControl';
import {
  StudentResultsBulkBar,
  type StudentResultsBulkBarAnchors,
} from '@/components/widgets/QuizWidget/components/results/StudentResultsBulkBar';
import type { ShowResultsDialogAnchors } from '@/components/widgets/QuizWidget/components/results/ShowResultsDialog';
import {
  StudentResultsSelectionContext,
  useStudentResultsSelection,
  useStudentResultsSelectionState,
  type StudentResultsActions,
} from '@/components/widgets/QuizWidget/components/results/studentResultsSelection';
import { cardLabel } from './flashcardRoster';

type Screen = 'home' | 'cards' | 'students' | 'speaking';
type StudentSort = 'score' | 'lastName';

export type FlashcardResultsRecord = FlashcardResultRecord &
  StaffResponseFields;

interface FlashcardResultsScreenProps {
  assignment: FlashcardAssignment;
  session: FlashcardSession;
  /** Already narrowed to the picked class. */
  results: FlashcardResultsRecord[];
  nameFor: (studentUid: string) => string;
  /** Family name first, for the Last name sort and the print order. */
  sortNameFor: (studentUid: string) => string;
  classLabelFor: (classId: string) => string;
  /** Roster names for the sheet export, keyed by student uid. */
  exportNames: Map<string, { givenName: string; familyName: string }>;
  speakLanguage: SpeakLanguage | null;
  onBack: () => void;
  classControls: React.ReactNode;
  launchedBy: React.ReactNode;
  addToast: (message: string, type?: Toast['type']) => void;
  /** Per-student Show / Hide / Follow class; the controls render only when provided. */
  studentResultsActions?: StudentResultsActions;
  /** The class-wide level, in Quiz's terms. */
  classVisibility?: QuizScoreVisibility;
  /** Lets a student locked out of their results back in. */
  onUnlockResults?: (studentUid: string) => Promise<void>;
}

// Same header colour as the Flashcards library, so the widget reads as one piece.
const FLASHCARDS_ACCENT = LIBRARY_HEADER_ACCENTS.flashcards ?? '#be185d';
// Flashcards has no learning targets, written answers or passages to print.
const HIDDEN_PRINT_OPTIONS: readonly ResultsPrintToggle[] = [
  'showTargets',
  'showWrittenFeedback',
  'includeStimuli',
];
// Quiz's Show results pieces, tagged with Flashcards' own tour anchors.
const SHOW_DIALOG_ANCHORS: ShowResultsDialogAnchors = {
  level: (level) =>
    tourFieldAttr('flashcards.results-show-level', 'flashcards', level),
  expiry: (preset) =>
    tourFieldAttr('flashcards.results-show-expiry', 'flashcards', preset),
  cancel: tourTypeAttr('flashcards.results-show-cancel', 'flashcards'),
  confirm: tourTypeAttr('flashcards.results-show-confirm', 'flashcards'),
};
const PANEL_ANCHORS = {
  show: tourTypeAttr('flashcards.results-student-show', 'flashcards'),
  hide: tourTypeAttr('flashcards.results-student-hide', 'flashcards'),
  followClass: tourTypeAttr(
    'flashcards.results-student-follow-class',
    'flashcards'
  ),
};
const BULK_ANCHORS: StudentResultsBulkBarAnchors = {
  show: tourTypeAttr('flashcards.results-bulk-show', 'flashcards'),
  hide: tourTypeAttr('flashcards.results-bulk-hide', 'flashcards'),
  followClass: tourTypeAttr(
    'flashcards.results-bulk-follow-class',
    'flashcards'
  ),
  copyNames: tourTypeAttr('flashcards.results-bulk-copy-names', 'flashcards'),
  print: tourTypeAttr('flashcards.results-bulk-print', 'flashcards'),
  clear: tourTypeAttr('flashcards.results-bulk-clear', 'flashcards'),
  dialog: SHOW_DIALOG_ANCHORS,
};
const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});
const headerIcon = { width: 'min(16px, 5cqmin)', height: 'min(16px, 5cqmin)' };
const footerIcon = {
  width: 'min(14px, 4.5cqmin)',
  height: 'min(14px, 4.5cqmin)',
};
const checkboxStyle = {
  width: 'min(14px, 4.5cqmin)',
  height: 'min(14px, 4.5cqmin)',
} as const;
const smallText = { fontSize: 'min(11px, 3.8cqmin)' } as const;
const smallIcon = {
  width: 'min(12px, 3.8cqmin)',
  height: 'min(12px, 3.8cqmin)',
} as const;
const footerButtonClass =
  'inline-flex items-center bg-white border border-brand-gray-lighter hover:border-brand-blue-light text-brand-blue-primary font-sans font-semibold rounded-md transition-colors disabled:opacity-60';
const footerButtonStyle = {
  gap: 'min(6px, 1.5cqmin)',
  padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
  fontSize: 'min(13px, 4.5cqmin)',
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A Check assignment's Results screen, laid out like Quiz's: summary, distribution, card and student drill-downs, print and export. */
export const FlashcardResultsScreen: React.FC<FlashcardResultsScreenProps> = (
  props
) => {
  const selection = useStudentResultsSelectionState();
  return (
    <StudentResultsSelectionContext.Provider
      value={props.studentResultsActions ? selection : null}
    >
      <FlashcardResultsBody {...props} />
    </StudentResultsSelectionContext.Provider>
  );
};

const FlashcardResultsBody: React.FC<FlashcardResultsScreenProps> = ({
  assignment,
  session,
  results,
  nameFor,
  sortNameFor,
  classLabelFor,
  exportNames,
  speakLanguage,
  onBack,
  classControls,
  launchedBy,
  addToast,
  studentResultsActions,
  classVisibility = 'none',
  onUnlockResults,
}) => {
  const { ensureGoogleScope, isExternalUser, user } = useAuth();
  const selection = useStudentResultsSelection();
  const resultsActions = selection ? studentResultsActions : undefined;
  const outward = useViewAsOutward();
  const [screen, setScreen] = useState<Screen>('home');
  const [cardIndex, setCardIndex] = useState<number | null>(null);
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [sort, setSort] = useState<StudentSort>('score');
  const [hideNames, setHideNames] = useState(false);
  const [printSelection, setPrintSelection] = useState<
    readonly string[] | null | undefined
  >(undefined);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const title = assignment.setTitle || 'Untitled set';
  const ended = session.status === 'ended' || assignment.status === 'ended';
  const typedCards = session.checkMode !== 'speak';

  const rows = useMemo(
    () => buildCheckRows(session, results),
    [results, session]
  );
  const finished = rows.filter((row) => row.percent !== null);
  const scores = finished.map((row) => Math.round(row.percent ?? 0));
  const average =
    scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
      : null;
  const accuracy = useMemo(
    () => (typedCards ? [] : checkCardAccuracy(session, results)),
    [results, session, typedCards]
  );

  const quiz = useMemo(
    () => flashcardQuizData(session, title),
    [session, title]
  );
  const responses = useMemo(
    () =>
      results.map((r) =>
        flashcardQuizResponse(
          r,
          session,
          r.classId ? classLabelFor(r.classId) : undefined
        )
      ),
    [classLabelFor, results, session]
  );
  const responseByUid = useMemo(
    () => new Map(responses.map((r) => [r.studentUid, r])),
    [responses]
  );
  const overrideByUid = useMemo(
    () => new Map(results.map((r) => [r.studentUid, r.resultsOverride])),
    [results]
  );
  // Students who left their protected results too often, with the count that locked them.
  const lockedByUid = useMemo(
    () =>
      new Map(
        results
          .filter((r) => r.resultsLockedOut === true)
          .map((r) => [
            r.studentUid,
            {
              warnings: r.resultsTabWarnings ?? 0,
              threshold:
                resolveFlashcardResultsVisibility(session, r).protection
                  ?.tabWarningThreshold ?? 3,
            },
          ])
      ),
    [results, session]
  );

  // Numbered by real name, so "Student 3" is the same student on every screen.
  const maskedNames = useMemo(() => {
    const ordered = results
      .map((r) => r.studentUid)
      .sort((a, b) => collator.compare(nameFor(a), nameFor(b)));
    return new Map(ordered.map((uid, i) => [uid, `Student ${i + 1}`]));
  }, [nameFor, results]);
  const shownName = (uid: string): string =>
    hideNames ? (maskedNames.get(uid) ?? 'Student') : nameFor(uid);

  // Hidden names sort by the masked label so the order can't hint at real last names.
  const studentRows = useMemo(() => {
    const key = (uid: string): string =>
      hideNames ? (maskedNames.get(uid) ?? '') : sortNameFor(uid);
    return rows.slice().sort((a, b) => {
      const byName = collator.compare(key(a.studentUid), key(b.studentUid));
      const scoreA = a.percent ?? -1;
      const scoreB = b.percent ?? -1;
      return sort === 'lastName'
        ? byName || scoreB - scoreA
        : scoreB - scoreA || byName;
    });
  }, [hideNames, maskedNames, rows, sort, sortNameFor]);

  const classOrder = useMemo(
    () =>
      [
        ...new Set(
          responses.flatMap((r) => (r.classPeriod ? [r.classPeriod] : []))
        ),
      ].sort((a, b) => collator.compare(a, b)),
    [responses]
  );

  const handleExport = async (): Promise<void> => {
    if (
      outward.active &&
      !(await outward.confirm('Export to Sheets', VIEW_AS_WRITES.exportSheets))
    )
      return;
    // A new sheet the teacher owns, so the login drive.file scope is enough.
    const token = await ensureGoogleScope('drive.file', { interactive: true });
    if (!token) {
      addToast(
        'Google access token not available. Please sign in again.',
        'error'
      );
      return;
    }
    setExporting(true);
    try {
      const drive = new QuizDriveService(token);
      const url = await drive.exportResultsToSheet(
        title,
        responses,
        quiz.questions,
        {
          byStudentUid: exportNames,
          gradeFn: flashcardGradeFn,
        }
      );
      setExportUrl(url);
    } catch (err) {
      logError('FlashcardResultsScreen.export', err);
      addToast(
        err instanceof Error ? err.message : 'Export failed. Please try again.',
        'error'
      );
    } finally {
      setExporting(false);
    }
  };

  const headerTitle =
    screen === 'cards' && cardIndex !== null
      ? `${cardLabel(cardIndex)} results`
      : screen === 'cards'
        ? 'Card results'
        : screen === 'students'
          ? 'Students'
          : screen === 'speaking'
            ? 'Speaking'
            : title;

  const allKeys = responses.map((r) => r.studentUid);
  const allSelected =
    allKeys.length > 0 &&
    allKeys.every((k) => selection?.selectedResponseKeys.has(k));
  const anySelected = allKeys.some((k) =>
    selection?.selectedResponseKeys.has(k)
  );
  const selectAllBox = (withLabel: boolean) => (
    <label
      className="flex items-center font-sans text-brand-gray-primary cursor-pointer"
      style={{ gap: 'min(6px, 1.5cqmin)', fontSize: 'min(11px, 3.5cqmin)' }}
    >
      <input
        type="checkbox"
        checked={allSelected}
        ref={(el) => {
          if (el) el.indeterminate = anySelected && !allSelected;
        }}
        aria-label={withLabel ? undefined : 'Select all'}
        onChange={() =>
          allSelected
            ? selection?.clearSelection()
            : selection?.addToSelection(allKeys)
        }
        {...tourTypeAttr(
          'flashcards.results-students-select-all',
          'flashcards'
        )}
        className="accent-brand-blue-primary"
        style={checkboxStyle}
      />
      {withLabel && 'Select all'}
    </label>
  );

  const goBack = (): void => {
    if (screen === 'home') onBack();
    else if (screen === 'cards' && cardIndex !== null) setCardIndex(null);
    else setScreen('home');
  };

  const renderStudent = (uid: string, rowIndex: number) => {
    const row = rows.find((r) => r.studentUid === uid);
    const response = responseByUid.get(uid);
    if (!row || !response) return null;
    const open = openStudent === uid;
    const name = shownName(uid);
    const locked = lockedByUid.get(uid);
    const unlock =
      locked && onUnlockResults ? () => onUnlockResults(uid) : undefined;
    const drilldown = open
      ? computeStudentDrilldown(quiz.questions, response, flashcardGradeFn)
      : null;
    return (
      <div
        key={uid}
        className={`rounded-lg border bg-white ${open ? 'border-brand-blue-light' : 'border-brand-gray-lightest'}`}
        style={{ padding: 'min(7px, 1.8cqmin) min(10px, 2.5cqmin)' }}
      >
        <div
          onClick={() => setOpenStudent(open ? null : uid)}
          className="flex items-center justify-between cursor-pointer"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          <div
            className="flex flex-wrap items-center min-w-0"
            style={{ gap: 'min(6px, 1.5cqmin)' }}
          >
            {selection && resultsActions && (
              <input
                type="checkbox"
                aria-label={`Select ${name}`}
                checked={selection.selectedResponseKeys.has(uid)}
                onChange={() => selection.toggle(uid)}
                onClick={(e) => e.stopPropagation()}
                {...tourFieldAttr(
                  'flashcards.results-student-select',
                  'flashcards',
                  `row-${rowIndex + 1}`
                )}
                className="shrink-0 accent-brand-blue-primary"
                style={checkboxStyle}
              />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenStudent(open ? null : uid);
              }}
              aria-expanded={open}
              {...tourFieldAttr(
                'flashcards.results-student',
                'flashcards',
                `row-${rowIndex + 1}`
              )}
              className="flex items-center min-w-0 text-left rounded-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
              style={{ gap: 'min(4px, 1cqmin)' }}
            >
              <ChevronRight
                aria-hidden
                className={`shrink-0 text-brand-gray-primary transition-transform ${open ? 'rotate-90' : ''}`}
                style={smallIcon}
              />
              <span
                className="font-sans font-medium text-brand-gray-dark truncate"
                style={{ fontSize: 'min(13px, 4.5cqmin)' }}
              >
                {name}
              </span>
            </button>
            {resultsActions && (
              <ResultsOverrideBadge override={overrideByUid.get(uid)} />
            )}
            {locked && (
              <span
                title={`Results locked after ${locked.warnings} of ${locked.threshold} tab-switch warnings`}
                className="shrink-0"
              >
                <SessionBadge
                  tone="warn"
                  icon={Lock}
                  label={`Locked (${locked.warnings}/${locked.threshold})`}
                />
              </span>
            )}
          </div>
          <div
            className="flex items-center shrink-0"
            style={{ gap: 'min(4px, 1cqmin)' }}
          >
            <div className="text-right shrink-0">
              {row.percent !== null ? (
                <>
                  <ScorePill score={row.percent} display="percent" />
                  <p
                    className="text-brand-gray-primary tabular-nums"
                    style={{ fontSize: 'min(10px, 3cqmin)' }}
                  >
                    {row.score}/{row.total} pts
                  </p>
                </>
              ) : (
                <div
                  className="bg-brand-gray-lightest text-brand-gray-primary font-black uppercase rounded-sm tracking-tighter"
                  style={{
                    fontSize: 'min(9px, 2.5cqmin)',
                    padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                  }}
                >
                  {response.status}
                </div>
              )}
            </div>
            {resultsActions && (
              // The menu and its dialog sit in the row; keep their clicks from toggling it.
              <span onClick={(e) => e.stopPropagation()}>
                <StudentResultsControl
                  responseKey={uid}
                  override={overrideByUid.get(uid)}
                  completed={response.status === 'completed'}
                  displayName={name}
                  classVisibility={classVisibility}
                  actions={resultsActions}
                  addToast={addToast}
                  triggerAnchor={tourFieldAttr(
                    'flashcards.results-student-menu',
                    'flashcards',
                    `row-${rowIndex + 1}`
                  )}
                  tourId="flashcards.results-student-menu-item"
                  tourScope="flashcards"
                  dialogAnchors={SHOW_DIALOG_ANCHORS}
                  onUnlock={unlock}
                />
              </span>
            )}
          </div>
        </div>
        {drilldown && (
          <div
            className="flex flex-col border-t border-brand-gray-lightest"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              marginTop: 'min(6px, 1.5cqmin)',
              paddingTop: 'min(6px, 1.5cqmin)',
            }}
          >
            {resultsActions && (
              <StudentResultsControl
                layout="panel"
                responseKey={uid}
                override={overrideByUid.get(uid)}
                completed={response.status === 'completed'}
                displayName={name}
                classVisibility={classVisibility}
                actions={resultsActions}
                addToast={addToast}
                panelAnchors={PANEL_ANCHORS}
                dialogAnchors={SHOW_DIALOG_ANCHORS}
                onUnlock={unlock}
              />
            )}
            {drilldown.lines.length === 0 ? (
              <p
                className="font-sans text-brand-gray-primary"
                style={smallText}
              >
                No answers yet.
              </p>
            ) : (
              <ul className="flex flex-col" style={{ gap: 'min(8px, 2cqmin)' }}>
                {drilldown.lines.map((line) => (
                  <StudentAnswerLine key={line.questionId} line={line} />
                ))}
              </ul>
            )}
            <div
              className="flex flex-wrap items-center justify-end border-t border-brand-gray-lightest"
              style={{
                gap: 'min(8px, 2cqmin)',
                paddingTop: 'min(6px, 1.5cqmin)',
              }}
            >
              <button
                type="button"
                onClick={() => setPrintSelection([uid])}
                {...tourTypeAttr(
                  'flashcards.results-student-print',
                  'flashcards'
                )}
                className="inline-flex items-center rounded-md border border-brand-gray-lighter bg-white font-sans font-semibold text-brand-blue-primary hover:border-brand-blue-light transition-colors"
                style={{
                  ...smallText,
                  gap: 'min(4px, 1cqmin)',
                  padding: 'min(4px, 1cqmin) min(10px, 2.5cqmin)',
                }}
              >
                <Printer aria-hidden style={smallIcon} />
                Print report
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-white font-sans text-brand-gray-dark">
      <div
        className="flex shrink-0 items-center text-white"
        style={{
          backgroundColor: FLASHCARDS_ACCENT,
          gap: 'min(8px, 2cqmin)',
          padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
        }}
      >
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          {...tourTypeAttr('flashcards.results-back', 'flashcards')}
          className="touch-target-expand relative rounded-md transition-colors hover:bg-white/15"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          <ArrowLeft style={headerIcon} />
        </button>
        <p
          className="flex-1 truncate font-sans font-semibold"
          style={{ fontSize: 'min(14px, 5cqmin)' }}
        >
          {headerTitle}
        </p>
        {responses.length > 0 && (
          <button
            type="button"
            onClick={() => setPrintSelection(null)}
            aria-label="Print results"
            title="Print results"
            {...tourTypeAttr('flashcards.results-print', 'flashcards')}
            className="shrink-0 rounded-md transition-colors hover:bg-white/15"
            style={{ padding: 'min(4px, 1cqmin)' }}
          >
            <Printer aria-hidden style={headerIcon} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setHideNames((v) => !v)}
          aria-pressed={hideNames}
          aria-label="Hide student names"
          title={hideNames ? 'Show student names' : 'Hide student names'}
          {...tourTypeAttr('flashcards.results-hide-names', 'flashcards')}
          className="shrink-0 rounded-md transition-colors hover:bg-white/15"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          {hideNames ? (
            <EyeOff aria-hidden style={headerIcon} />
          ) : (
            <Eye aria-hidden style={headerIcon} />
          )}
        </button>
        <span
          className="shrink-0 rounded-full bg-white/20 font-sans font-semibold uppercase tracking-wider text-white"
          style={{
            fontSize: 'min(10px, 3.5cqmin)',
            padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
          }}
        >
          Results
        </span>
      </div>

      {results.length === 0 && screen === 'home' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {(launchedBy != null || classControls != null) && (
            <div
              className="flex flex-col"
              style={{
                gap: 'min(10px, 2.5cqmin)',
                padding: 'min(12px, 3cqmin)',
              }}
            >
              {launchedBy}
              {classControls}
            </div>
          )}
          <ScaledEmptyState
            icon={BarChart3}
            title="No data available yet"
            subtitle="Results appear here once students submit."
          />
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto custom-scrollbar"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          {screen === 'home' && (
            <div
              className="flex flex-col"
              style={{ gap: 'min(10px, 2.5cqmin)' }}
            >
              {launchedBy}
              {classControls}
              <ResultsSummaryCard
                label="Class average"
                value={average !== null ? `${average}%` : '—'}
                detail={`${finished.length} of ${rows.length} students finished`}
              />
              <ScoreDistributionBars scores={scores} />
              <div
                className="flex flex-col"
                style={{ gap: 'min(6px, 1.5cqmin)' }}
              >
                <ResultsDrillRow
                  label="Card results"
                  detail={plural(session.cards.length, 'card')}
                  onClick={() => setScreen('cards')}
                  anchor={tourFieldAttr(
                    'flashcards.results-drill',
                    'flashcards',
                    'cards'
                  )}
                />
                <ResultsDrillRow
                  label="Students"
                  detail={plural(rows.length, 'student')}
                  onClick={() => setScreen('students')}
                  anchor={tourFieldAttr(
                    'flashcards.results-drill',
                    'flashcards',
                    'students'
                  )}
                />
                {speakLanguage && (
                  <ResultsDrillRow
                    label="Speaking"
                    detail={plural(session.cards.length, 'card')}
                    onClick={() => setScreen('speaking')}
                    anchor={tourFieldAttr(
                      'flashcards.results-drill',
                      'flashcards',
                      'speaking'
                    )}
                  />
                )}
              </div>
            </div>
          )}

          {screen === 'cards' && typedCards && cardIndex === null && (
            <FlashcardCardList
              session={session}
              results={results}
              ended={ended}
              onOpen={setCardIndex}
            />
          )}
          {screen === 'cards' && typedCards && cardIndex !== null && (
            <FlashcardCardDetail
              session={session}
              results={results}
              index={cardIndex}
              ended={ended}
            />
          )}
          {screen === 'cards' && !typedCards && (
            <div
              className="flex flex-col"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              <FlashcardCardAccuracyList accuracy={accuracy} />
            </div>
          )}

          {screen === 'students' && (
            <div
              className="flex flex-col"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              {selection && resultsActions && anySelected ? (
                <StudentResultsBulkBar
                  responses={responses}
                  selection={selection}
                  actions={resultsActions}
                  classVisibility={classVisibility}
                  resolveName={(r) => shownName(r.studentUid)}
                  addToast={addToast}
                  onPrint={(keys) => setPrintSelection(keys)}
                  anchors={BULK_ANCHORS}
                  variant="inline"
                  leading={selectAllBox(false)}
                />
              ) : (
                <div
                  className="flex flex-wrap items-center"
                  style={{
                    gap: 'min(8px, 2cqmin)',
                    paddingLeft: 'min(10px, 2.5cqmin)',
                  }}
                >
                  {selection && resultsActions && selectAllBox(true)}
                  <div className="ml-auto flex items-center">
                    <SegmentedToggle
                      label="Sort students"
                      value={sort}
                      options={[
                        ['score', 'Score'],
                        ['lastName', 'Last name'],
                      ]}
                      onChange={setSort}
                      anchor={(v) =>
                        tourFieldAttr(
                          'flashcards.results-students-sort',
                          'flashcards',
                          v
                        )
                      }
                    />
                  </div>
                </div>
              )}
              {studentRows.map((row, i) => renderStudent(row.studentUid, i))}
            </div>
          )}

          {screen === 'speaking' && speakLanguage && (
            <FlashcardSpeakResults
              session={session}
              results={results}
              language={speakLanguage}
              nameFor={shownName}
            />
          )}
        </div>
      )}

      {screen === 'home' && results.length > 0 && !isExternalUser && (
        <div
          className="flex items-center border-t border-brand-gray-lightest shrink-0"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
          }}
        >
          <div
            className="ml-auto flex items-center shrink-0"
            style={{ gap: 'min(6px, 1.5cqmin)' }}
          >
            {exportUrl && (
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={exporting}
                aria-label="Re-export sheet (creates a new sheet)"
                title="Re-export sheet (creates a new sheet)"
                {...tourTypeAttr(
                  'flashcards.results-sheet-refresh',
                  'flashcards'
                )}
                className={footerButtonClass}
                style={{ padding: 'min(8px, 2cqmin)' }}
              >
                {exporting ? (
                  <Loader2
                    aria-hidden
                    className="animate-spin"
                    style={footerIcon}
                  />
                ) : (
                  <RefreshCw aria-hidden style={footerIcon} />
                )}
              </button>
            )}
            {exportUrl ? (
              <a
                href={exportUrl}
                target="_blank"
                rel="noopener noreferrer"
                {...tourTypeAttr('flashcards.results-open-sheet', 'flashcards')}
                className={footerButtonClass}
                style={footerButtonStyle}
              >
                <ExternalLink aria-hidden style={footerIcon} />
                Open Sheet
              </a>
            ) : (
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={exporting || outward.locked}
                title={outward.lockedTitle}
                {...tourTypeAttr('flashcards.results-export', 'flashcards')}
                className={footerButtonClass}
                style={footerButtonStyle}
              >
                {exporting ? (
                  <Loader2
                    aria-hidden
                    className="animate-spin"
                    style={footerIcon}
                  />
                ) : (
                  <FileSpreadsheet aria-hidden style={footerIcon} />
                )}
                Export to Sheets
              </button>
            )}
          </div>
        </div>
      )}

      {printSelection !== undefined && (
        <ResultsPrintModal
          quiz={quiz}
          responses={responses}
          initialSelection={printSelection}
          resolveName={(r: QuizResponse) => nameFor(r.studentUid)}
          resolveShownName={(r: QuizResponse) => shownName(r.studentUid)}
          sortNameFor={(r: QuizResponse) => sortNameFor(r.studentUid)}
          targetsFor={() => []}
          gradeFn={flashcardGradeFn}
          rubricFor={() => undefined}
          periodOrder={classOrder}
          sessionLive={!ended}
          teacherUid={user?.uid ?? null}
          hiddenOptions={HIDDEN_PRINT_OPTIONS}
          onClose={() => setPrintSelection(undefined)}
          onError={(message) => addToast(message, 'error')}
        />
      )}
    </div>
  );
};
