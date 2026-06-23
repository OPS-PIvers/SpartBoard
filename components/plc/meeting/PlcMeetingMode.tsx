/**
 * PlcMeetingMode — the hero surface (PRD §6.2, Decisions 4.0 / 4.0b / 4.0c).
 *
 * A guided, projector-legible flow at `/plc/:id/meeting`:
 *
 *   1. Pick   — choose / designate the common assessment(s) to review.
 *   2. Review — large-type pooled data from the anonymized aggregates (team
 *               average, weakest questions, per-class compare, who-ran-it). Each
 *               data card is commentable (shared PlcCommentsThread).
 *   3. Decide — capture decisions, optionally linked to a weak question.
 *   4. Act    — spin up action items (assignee / due) → become PLC to-dos on save.
 *   5. Save   — write the PlcMeeting via `saveMeeting` (attendees from presence)
 *               + a `meeting_held` activity event, then offer export.
 *
 * A saved record opened at `/plc/:id/meeting/:meetingId` renders READ-ONLY with
 * an export button (Sheet / PDF).
 *
 * Data is all FERPA-safe: the Review numbers come from
 * `PlcAssessmentAggregate` rollups (no student names). Writes go through the
 * provider actions surface (`usePlcActions`); the live working state (selected
 * assessments, decisions, action items) is held locally and persisted to the
 * in-progress meeting doc as the user advances / on save.
 *
 * Surface: PLC light surface (white on slate-50). Muted text uses the
 * light-surface palette (`text-slate-500/600`). Respects `prefers-reduced-motion`
 * (no looping animations beyond the standard spinner). Keyboard-navigable; the
 * step rail is an `aria-current="step"` ordered list; icon-only controls carry
 * aria-labels.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  Save,
  Users,
} from 'lucide-react';

import type {
  Plc,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMeeting,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import {
  usePlcActions,
  usePlcAggregatesData,
  usePlcAssessmentsData,
  usePlcMembers,
  usePlcWhoIsHere,
} from '@/context/usePlcContext';
import { usePlcMeetings } from '@/hooks/usePlcMeetings';
import { usePlcContributions } from '@/hooks/usePlcContributions';
import { canEditPlcContent } from '@/utils/plc';
import { logError } from '@/utils/logError';
import { buildPlcPath, spaNavigate } from '@/utils/plcPath';
import {
  buildAssessmentCards,
  latestContributionByAggregateId,
  type AssessmentDataCard,
  type SharedDataTeamMember,
} from '@/components/plc/sharedData/sharedDataSelectors';
import {
  exportPlcMeeting,
  type PlcMeetingExportContext,
  type PlcMeetingExportFormat,
} from '@/utils/plcMeetingExport';
import type { PlcSectionId } from '@/components/plc/sections';
import { PlcMeetingReviewCard } from './PlcMeetingReviewCard';
import {
  MeetingStepRail,
  MEETING_STEP_ORDER,
  PlcMeetingActStep,
  PlcMeetingDecideStep,
  PlcMeetingPickStep,
  type MeetingStep,
} from './PlcMeetingSteps';
import { PlcMeetingRecordView } from './PlcMeetingRecordView';

interface PlcMeetingModeProps {
  plc: Plc;
  /** A saved meeting record id (read-only view), or null for the live flow. */
  meetingId?: string | null;
  onNavigate: (section: PlcSectionId) => void;
}

type Decision = PlcMeeting['decisions'][number];
type ActionItem = PlcMeeting['actionItems'][number];

export const PlcMeetingMode: React.FC<PlcMeetingModeProps> = ({
  plc,
  meetingId = null,
  onNavigate,
}) => {
  // A saved record route renders the read-only view; the live flow otherwise.
  if (meetingId) {
    return <PlcMeetingRecordView plc={plc} meetingId={meetingId} />;
  }
  return <PlcMeetingLiveFlow plc={plc} onNavigate={onNavigate} />;
};

// ===========================================================================
// Live guided flow
// ===========================================================================

const PlcMeetingLiveFlow: React.FC<{
  plc: Plc;
  onNavigate: (section: PlcSectionId) => void;
}> = ({ plc, onNavigate }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { showPrompt, showConfirm } = useDialog();
  const { designateAssessment, createMeeting, updateMeeting, saveMeeting } =
    usePlcActions();

  const {
    data: aggregates,
    loading: aggregatesLoading,
    error: aggregatesError,
  } = usePlcAggregatesData();
  const {
    data: assessments,
    loading: assessmentsLoading,
    error: assessmentsError,
  } = usePlcAssessmentsData();
  const members = usePlcMembers();
  const whoIsHere = usePlcWhoIsHere();
  const { meetings } = usePlcMeetings(plc.id);
  // The signed-in member's OWN contribution read — only to flag a card
  // "updating…" when their just-published result outruns the rollup. No other
  // teacher's PII is read here.
  const { contributions: ownContributions } = usePlcContributions(plc.id);

  const canEdit = useMemo(
    () => (user ? canEditPlcContent(plc, user.uid) : false),
    [plc, user]
  );

  const teamMembers = useMemo<SharedDataTeamMember[]>(
    () => members.map((m) => ({ uid: m.uid, displayName: m.displayName })),
    [members]
  );

  const latestContribByAggId = useMemo(
    () => latestContributionByAggregateId(ownContributions, assessments),
    [ownContributions, assessments]
  );

  const cards = useMemo(
    () =>
      buildAssessmentCards(
        aggregates,
        assessments,
        teamMembers,
        user?.uid ?? null,
        latestContribByAggId
      ),
    [aggregates, assessments, teamMembers, user?.uid, latestContribByAggId]
  );
  const cardById = useMemo(() => {
    const map = new Map<string, AssessmentDataCard>();
    for (const c of cards) map.set(c.assessmentId, c);
    return map;
  }, [cards]);
  const cardTitleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of cards) map[c.assessmentId] = c.title;
    return map;
  }, [cards]);

  // --- Live working state -------------------------------------------------
  const [step, setStep] = useState<MeetingStep>('pick');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [meetingDocId, setMeetingDocId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMeetingId, setSavedMeetingId] = useState<string | null>(null);

  const currentIndex = MEETING_STEP_ORDER.indexOf(step);
  const [furthestIndex, setFurthestIndex] = useState(0);

  const selectedCards = useMemo(
    () =>
      Array.from(selectedIds)
        .map((id) => cardById.get(id))
        .filter((c): c is AssessmentDataCard => c != null),
    [selectedIds, cardById]
  );

  // Ensure an in-progress meeting doc exists, returning its id. Created lazily
  // on the first real action (selecting an assessment / advancing) so merely
  // opening Meeting Mode does not write a doc.
  const ensureMeetingDoc = useCallback(async (): Promise<string | null> => {
    if (meetingDocId) return meetingDocId;
    try {
      const id = await createMeeting({ assessmentIds: [] });
      setMeetingDocId(id);
      return id;
    } catch (err) {
      logError('PlcMeetingMode.createMeeting', err, { plcId: plc.id });
      addToast(
        t('plcDashboard.meeting.createFailed', {
          defaultValue: 'Couldn’t start the meeting. Try again.',
        }),
        'error'
      );
      return null;
    }
  }, [meetingDocId, createMeeting, plc.id, addToast, t]);

  const toggleSelected = useCallback((assessmentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assessmentId)) next.delete(assessmentId);
      else next.add(assessmentId);
      return next;
    });
  }, []);

  const handleDesignate = useCallback(
    async (card: AssessmentDataCard) => {
      const title = await showPrompt(
        t('plcDashboard.meeting.designatePrompt', {
          defaultValue:
            'Name this common assessment so the whole team recognizes it.',
        }),
        {
          title: t('plcDashboard.meeting.designatePromptTitle', {
            defaultValue: 'Designate common assessment',
          }),
          placeholder: t('plcDashboard.meeting.designatePlaceholder', {
            defaultValue: 'e.g. Unit 4 CFA',
          }),
          defaultValue: card.title,
          confirmLabel: t('plcDashboard.meeting.pick.designate', {
            defaultValue: 'Designate',
          }),
        }
      );
      if (title == null) return;
      const trimmed = title.trim();
      if (!trimmed) return;
      try {
        await designateAssessment({
          title: trimmed,
          kind: card.kind,
          syncGroupId: card.syncGroupId,
        });
        addToast(
          t('plcDashboard.meeting.designated', {
            defaultValue: '“{{title}}” is now the team’s common assessment.',
            title: trimmed,
          }),
          'success'
        );
      } catch (err) {
        logError('PlcMeetingMode.designateAssessment', err, {
          plcId: plc.id,
          assessmentId: card.assessmentId,
        });
        addToast(
          t('plcDashboard.meeting.designateFailed', {
            defaultValue: 'Couldn’t designate that assessment. Try again.',
          }),
          'error'
        );
      }
    },
    [showPrompt, designateAssessment, addToast, plc.id, t]
  );

  const goToStep = useCallback((next: MeetingStep) => {
    setStep(next);
    const idx = MEETING_STEP_ORDER.indexOf(next);
    setFurthestIndex((prev) => Math.max(prev, idx));
  }, []);

  // Discuss-a-question → jump to Decide with a draft decision pre-linked.
  const handleDiscuss = useCallback(
    (assessmentId: string, questionId?: string) => {
      const linked: Decision['linkedDataCard'] = questionId
        ? { assessmentId, questionId }
        : { assessmentId };
      setDecisions((prev) => [
        ...prev,
        { id: crypto.randomUUID(), text: '', linkedDataCard: linked },
      ]);
      goToStep('decide');
    },
    [goToStep]
  );

  // Persist the live working state to the in-progress doc (best-effort), so a
  // refresh / teammate sees progress and Save reads a fresh doc.
  const persistProgress = useCallback(
    async (
      id: string,
      patch: {
        assessmentIds?: string[];
        decisions?: Decision[];
        actionItems?: ActionItem[];
      }
    ) => {
      try {
        await updateMeeting(id, patch);
      } catch (err) {
        // Non-fatal: the local state is the source of truth until Save, which
        // re-sends everything. A transient sync failure must not block the flow.
        logError('PlcMeetingMode.persistProgress', err, { plcId: plc.id });
      }
    },
    [updateMeeting, plc.id]
  );

  const handleNext = useCallback(async () => {
    // Advancing past Pick materializes the in-progress doc with the selection.
    if (step === 'pick') {
      if (selectedIds.size === 0) {
        addToast(
          t('plcDashboard.meeting.pickRequired', {
            defaultValue: 'Pick at least one assessment to review.',
          }),
          'info'
        );
        return;
      }
      const id = await ensureMeetingDoc();
      if (id) await persistProgress(id, { assessmentIds: [...selectedIds] });
    } else if (step === 'decide' && meetingDocId) {
      await persistProgress(meetingDocId, {
        decisions: decisions.filter((d) => d.text.trim().length > 0),
      });
    } else if (step === 'act' && meetingDocId) {
      await persistProgress(meetingDocId, { actionItems });
    }
    const idx = MEETING_STEP_ORDER.indexOf(step);
    const next =
      MEETING_STEP_ORDER[Math.min(idx + 1, MEETING_STEP_ORDER.length - 1)];
    goToStep(next);
  }, [
    step,
    selectedIds,
    ensureMeetingDoc,
    persistProgress,
    meetingDocId,
    decisions,
    actionItems,
    goToStep,
    addToast,
    t,
  ]);

  const handleBack = useCallback(() => {
    const idx = MEETING_STEP_ORDER.indexOf(step);
    if (idx > 0) goToStep(MEETING_STEP_ORDER[idx - 1]);
  }, [step, goToStep]);

  const handleSave = useCallback(async () => {
    const id = meetingDocId ?? (await ensureMeetingDoc());
    if (!id) return;
    setSaving(true);
    try {
      const cleanDecisions = decisions.filter((d) => d.text.trim().length > 0);
      await saveMeeting(id, {
        assessmentIds: [...selectedIds],
        decisions: cleanDecisions,
        actionItems,
      });
      setSavedMeetingId(id);
      addToast(
        t('plcDashboard.meeting.saved', {
          defaultValue:
            'Meeting saved. The team can review the record anytime.',
        }),
        'success'
      );
    } catch (err) {
      logError('PlcMeetingMode.saveMeeting', err, { plcId: plc.id });
      addToast(
        t('plcDashboard.meeting.saveFailed', {
          defaultValue: 'Couldn’t save the meeting. Try again.',
        }),
        'error'
      );
    } finally {
      setSaving(false);
    }
  }, [
    meetingDocId,
    ensureMeetingDoc,
    decisions,
    saveMeeting,
    selectedIds,
    actionItems,
    addToast,
    plc.id,
    t,
  ]);

  const handleStartOver = useCallback(async () => {
    const ok = await showConfirm(
      t('plcDashboard.meeting.startOverConfirm', {
        defaultValue:
          'Start a new meeting? This clears the current selections and notes.',
      }),
      {
        title: t('plcDashboard.meeting.startOverTitle', {
          defaultValue: 'Start a new meeting',
        }),
        confirmLabel: t('plcDashboard.meeting.startOver', {
          defaultValue: 'Start over',
        }),
      }
    );
    if (!ok) return;
    setStep('pick');
    setSelectedIds(new Set());
    setDecisions([]);
    setActionItems([]);
    setMeetingDocId(null);
    setSavedMeetingId(null);
    setFurthestIndex(0);
  }, [showConfirm, t]);

  // --- Loading / error ----------------------------------------------------
  if (aggregatesLoading || assessmentsLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[240px] text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">
          {t('plcDashboard.meeting.loading', {
            defaultValue: 'Loading meeting data…',
          })}
        </span>
      </div>
    );
  }
  if (aggregatesError || assessmentsError) {
    const err = aggregatesError ?? assessmentsError;
    return (
      <div className="m-4 lg:m-6 bg-white border border-brand-red-primary/20 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle
          className="w-5 h-5 text-brand-red-primary shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-bold text-slate-800">
            {t('plcDashboard.meeting.loadError', {
              defaultValue: 'Couldn’t load meeting data',
            })}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {err instanceof Error ? err.message : String(err)}
          </p>
        </div>
      </div>
    );
  }

  const isLastStep = currentIndex === MEETING_STEP_ORDER.length - 1;

  return (
    <div className="flex flex-col h-full">
      {/* Step rail header — sticky so it stays glanceable while scrolling. */}
      <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
        <MeetingStepRail
          current={step}
          furthestIndex={furthestIndex}
          onStep={goToStep}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
          >
            <History className="w-4 h-4" aria-hidden="true" />
            {t('plcDashboard.meeting.pastMeetings', {
              defaultValue: 'Past meetings ({{count}})',
              count: meetings.length,
            })}
          </button>
        </div>
      </div>

      {/* Step body */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6">
        <div className="max-w-4xl mx-auto">
          {step === 'pick' && (
            <PlcMeetingPickStep
              cards={cards}
              selectedIds={selectedIds}
              onToggle={toggleSelected}
              canEdit={canEdit}
              onDesignate={handleDesignate}
            />
          )}

          {step === 'review' && (
            <div className="space-y-6">
              <header>
                <h2 className="text-2xl font-extrabold text-slate-800">
                  {t('plcDashboard.meeting.review.heading', {
                    defaultValue: 'What does the data say?',
                  })}
                </h2>
                <p className="text-base text-slate-600 mt-1">
                  {t('plcDashboard.meeting.review.subtitle', {
                    defaultValue:
                      'Pooled, anonymized results. Click a question to capture a decision about it.',
                  })}
                </p>
              </header>
              {selectedCards.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {t('plcDashboard.meeting.review.none', {
                    defaultValue: 'No assessments selected — go back to Pick.',
                  })}
                </p>
              ) : (
                <div className="space-y-5">
                  {selectedCards.map((card) => (
                    <PlcMeetingReviewCard
                      key={card.assessmentId}
                      card={card}
                      plcId={plc.id}
                      onDiscuss={handleDiscuss}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'decide' && (
            <PlcMeetingDecideStep
              decisions={decisions}
              onChange={setDecisions}
              cardTitleById={cardTitleById}
              canEdit={canEdit}
            />
          )}

          {step === 'act' && (
            <PlcMeetingActStep
              actionItems={actionItems}
              onChange={setActionItems}
              members={teamMembers}
              canEdit={canEdit}
            />
          )}

          {step === 'save' && (
            <SaveStep
              plc={plc}
              attendeePreview={whoIsHere.map((p) => p.displayName)}
              selectedCards={selectedCards}
              decisionCount={
                decisions.filter((d) => d.text.trim().length > 0).length
              }
              actionItemCount={actionItems.length}
              savedMeetingId={savedMeetingId}
              canEdit={canEdit}
              onStartOver={handleStartOver}
              onViewRecord={(id) =>
                spaNavigate(buildPlcPath(plc.id, 'meeting', id))
              }
            />
          )}
        </div>
      </div>

      {/* Step footer — Back / Next, hidden on the terminal Save step's success. */}
      {!(isLastStep && savedMeetingId) && (
        <div className="border-t border-slate-200 bg-white px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            {t('plcDashboard.meeting.back', { defaultValue: 'Back' })}
          </button>

          {isLastStep ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !canEdit}
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="w-4 h-4" aria-hidden="true" />
              )}
              {t('plcDashboard.meeting.saveMeeting', {
                defaultValue: 'Save meeting',
              })}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-5 py-2.5 rounded-xl shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              {t('plcDashboard.meeting.next', { defaultValue: 'Next' })}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ===========================================================================
// Save step body
// ===========================================================================

const SaveStep: React.FC<{
  plc: Plc;
  attendeePreview: string[];
  selectedCards: AssessmentDataCard[];
  decisionCount: number;
  actionItemCount: number;
  savedMeetingId: string | null;
  canEdit: boolean;
  onStartOver: () => void;
  onViewRecord: (meetingId: string) => void;
}> = ({
  plc,
  attendeePreview,
  selectedCards,
  decisionCount,
  actionItemCount,
  savedMeetingId,
  canEdit,
  onStartOver,
  onViewRecord,
}) => {
  const { t } = useTranslation();

  if (savedMeetingId) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-emerald-200 rounded-3xl p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <CheckCircle2
              className="w-8 h-8 text-emerald-600"
              aria-hidden="true"
            />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800">
            {t('plcDashboard.meeting.save.doneTitle', {
              defaultValue: 'Meeting saved',
            })}
          </h2>
          <p className="text-base text-slate-600 mt-1.5 max-w-md mx-auto">
            {t('plcDashboard.meeting.save.doneSubtitle', {
              defaultValue:
                'Action items are now tracked to-dos for their assignees. Export the record for your accountability files, or start a new meeting.',
            })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button
              type="button"
              onClick={() => onViewRecord(savedMeetingId)}
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-5 py-2.5 rounded-xl shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              {t('plcDashboard.meeting.save.viewRecord', {
                defaultValue: 'View meeting record',
              })}
            </button>
            <button
              type="button"
              onClick={onStartOver}
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 px-5 py-2.5 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              {t('plcDashboard.meeting.save.startNew', {
                defaultValue: 'Start a new meeting',
              })}
            </button>
          </div>
        </div>
        {/* The exporter lives on the record view; offer a quick link here too. */}
        <MeetingExportButtons plc={plc} meetingId={savedMeetingId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-extrabold text-slate-800">
          {t('plcDashboard.meeting.save.heading', {
            defaultValue: 'Ready to save?',
          })}
        </h2>
        <p className="text-base text-slate-600 mt-1">
          {t('plcDashboard.meeting.save.subtitle', {
            defaultValue:
              'Saving writes the meeting record, turns action items into to-dos, and logs it to the team activity feed.',
          })}
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2">
        <SummaryStat
          label={t('plcDashboard.meeting.save.reviewed', {
            defaultValue: 'Assessments reviewed',
          })}
          value={`${selectedCards.length}`}
        />
        <SummaryStat
          label={t('plcDashboard.meeting.save.decisions', {
            defaultValue: 'Decisions',
          })}
          value={`${decisionCount}`}
        />
        <SummaryStat
          label={t('plcDashboard.meeting.save.actions', {
            defaultValue: 'Action items → to-dos',
          })}
          value={`${actionItemCount}`}
        />
        <SummaryStat
          label={t('plcDashboard.meeting.save.attendees', {
            defaultValue: 'Attendees (from presence)',
          })}
          value={`${attendeePreview.length}`}
        />
      </dl>

      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Users
            className="w-4 h-4 text-brand-blue-primary"
            aria-hidden="true"
          />
          {t('plcDashboard.meeting.save.whoAttended', {
            defaultValue: 'Who’s here now',
          })}
        </h3>
        {attendeePreview.length === 0 ? (
          <p className="text-sm text-slate-500 mt-1.5">
            {t('plcDashboard.meeting.save.noAttendees', {
              defaultValue:
                'No one else is active right now — you’ll be recorded as the facilitator.',
            })}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 mt-2">
            {attendeePreview.map((name) => (
              <li
                key={name}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-slate-100 px-3 py-1 rounded-full"
              >
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!canEdit && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          {t('plcDashboard.meeting.save.viewerNote', {
            defaultValue:
              'Viewers can follow along but can’t save the meeting record.',
          })}
        </p>
      )}
    </div>
  );
};

const SummaryStat: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
      {label}
    </dt>
    <dd className="text-3xl font-extrabold text-slate-800 tabular-nums mt-0.5">
      {value}
    </dd>
  </div>
);

// ===========================================================================
// Export buttons (shared by Save success + the record view)
// ===========================================================================

export const MeetingExportButtons: React.FC<{
  plc: Plc;
  meetingId: string;
}> = ({ plc, meetingId }) => {
  const { t } = useTranslation();
  const { user, ensureGoogleScope } = useAuth();
  const { addToast } = useDashboard();
  const members = usePlcMembers();
  const { data: assessments } = usePlcAssessmentsData();
  const { data: aggregates } = usePlcAggregatesData();
  const { meetingsById } = usePlcMeetings(plc.id);
  const [busy, setBusy] = useState<PlcMeetingExportFormat | null>(null);

  const exportContext = useMemo<PlcMeetingExportContext>(() => {
    const memberNamesByUid: Record<string, string> = {};
    for (const m of members) memberNamesByUid[m.uid] = m.displayName;
    const assessmentsById: Record<string, PlcCommonAssessment> = {};
    for (const a of assessments) assessmentsById[a.id] = a;
    const aggregatesById: Record<string, PlcAssessmentAggregate> = {};
    for (const agg of aggregates) aggregatesById[agg.assessmentId] = agg;
    return {
      plcName: plc.name,
      memberNamesByUid,
      assessmentsById,
      aggregatesById,
    };
  }, [members, assessments, aggregates, plc.name]);

  const handleExport = useCallback(
    async (format: PlcMeetingExportFormat) => {
      const meeting = meetingsById[meetingId];
      if (!meeting) {
        addToast(
          t('plcDashboard.meeting.export.notReady', {
            defaultValue: 'The meeting record isn’t loaded yet. Try again.',
          }),
          'error'
        );
        return;
      }
      // Acquire the Sheets scope on demand (Path B). The PDF path also routes
      // through the Sheets API (creates a sheet, then exports it as PDF), so
      // both formats need the spreadsheets scope. Silent for already-granted
      // users; one-time consent popup for never-granted (user gesture).
      const token = await ensureGoogleScope('spreadsheets', {
        interactive: true,
      });
      if (!token) {
        addToast(
          t('plcDashboard.meeting.export.noGoogle', {
            defaultValue:
              'Connect your Google account to export the meeting record.',
          }),
          'error'
        );
        return;
      }
      setBusy(format);
      try {
        const result = await exportPlcMeeting(
          token,
          meeting,
          exportContext,
          format
        );
        if (format === 'pdf' && result.pdfBlob) {
          const url = URL.createObjectURL(result.pdfBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${result.fileName}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          addToast(
            t('plcDashboard.meeting.export.pdfDone', {
              defaultValue: 'Meeting record exported to PDF.',
            }),
            'success'
          );
        } else {
          addToast(
            t('plcDashboard.meeting.export.sheetDone', {
              defaultValue: 'Meeting record exported to Google Sheets.',
            }),
            'success',
            {
              label: t('plcDashboard.meeting.export.open', {
                defaultValue: 'Open',
              }),
              onClick: () => window.open(result.sheetUrl, '_blank', 'noopener'),
            }
          );
        }
      } catch (err) {
        logError('PlcMeetingMode.export', err, {
          plcId: plc.id,
          meetingId,
          uid: user?.uid,
        });
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.meeting.export.failed', {
                defaultValue: 'Couldn’t export the meeting record.',
              }),
          'error'
        );
      } finally {
        setBusy(null);
      }
    },
    [
      meetingsById,
      meetingId,
      ensureGoogleScope,
      exportContext,
      addToast,
      plc.id,
      user?.uid,
      t,
    ]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => handleExport('sheet')}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        {busy === 'sheet' ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
        )}
        {t('plcDashboard.meeting.export.toSheet', {
          defaultValue: 'Export to Sheets',
        })}
      </button>
      <button
        type="button"
        onClick={() => handleExport('pdf')}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        {busy === 'pdf' ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="w-4 h-4" aria-hidden="true" />
        )}
        {t('plcDashboard.meeting.export.toPdf', {
          defaultValue: 'Export to PDF',
        })}
      </button>
    </div>
  );
};
