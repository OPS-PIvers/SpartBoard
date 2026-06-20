/**
 * Meeting Mode step sub-components (PRD §6.2) — the Pick, Decide, and Act steps
 * plus the guided step-rail header. Kept out of `PlcMeetingMode` so the
 * orchestrator stays focused on flow/state and these stay focused on one step's
 * UI each.
 *
 * Design: brand-calm, projector-legible (large hierarchy, generous spacing,
 * minimal chrome). PLC light surface (white cards on slate-50) → muted text uses
 * the light-surface palette (`text-slate-500/600`). Every interactive control
 * carries a focus ring; icon-only controls carry an aria-label. The Review step
 * lives in `PlcMeetingMode` (it maps the data cards to `PlcMeetingReviewCard`s).
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Calendar,
  Check,
  ClipboardList,
  Lightbulb,
  Link2,
  ListChecks,
  Plus,
  Sparkles,
  Trash2,
  UserCircle2,
  Video,
} from 'lucide-react';
import type { PlcMeeting } from '@/types';
import type {
  AssessmentDataCard,
  SharedDataTeamMember,
} from '../sharedData/sharedDataSelectors';

// ---------------------------------------------------------------------------
// Step model + rail
// ---------------------------------------------------------------------------

/** The five guided steps, in order (PRD §6.2). */
export type MeetingStep = 'pick' | 'review' | 'decide' | 'act' | 'save';

export const MEETING_STEP_ORDER: readonly MeetingStep[] = [
  'pick',
  'review',
  'decide',
  'act',
  'save',
] as const;

interface StepRailProps {
  current: MeetingStep;
  /** Steps the user has reached / completed (navigable back to). */
  furthestIndex: number;
  onStep: (step: MeetingStep) => void;
}

const STEP_META: Record<
  MeetingStep,
  { labelKey: string; labelDefault: string }
> = {
  pick: { labelKey: 'plcDashboard.meeting.steps.pick', labelDefault: 'Pick' },
  review: {
    labelKey: 'plcDashboard.meeting.steps.review',
    labelDefault: 'Review',
  },
  decide: {
    labelKey: 'plcDashboard.meeting.steps.decide',
    labelDefault: 'Decide',
  },
  act: { labelKey: 'plcDashboard.meeting.steps.act', labelDefault: 'Act' },
  save: { labelKey: 'plcDashboard.meeting.steps.save', labelDefault: 'Save' },
};

/** The guided progress rail across the top of Meeting Mode. */
export const MeetingStepRail: React.FC<StepRailProps> = ({
  current,
  furthestIndex,
  onStep,
}) => {
  const { t } = useTranslation();
  const currentIndex = MEETING_STEP_ORDER.indexOf(current);
  return (
    <nav
      aria-label={t('plcDashboard.meeting.stepsLabel', {
        defaultValue: 'Meeting steps',
      })}
    >
      <ol className="flex items-center gap-1 sm:gap-2">
        {MEETING_STEP_ORDER.map((step, index) => {
          const isCurrent = step === current;
          const isDone = index < currentIndex;
          const reached = index <= furthestIndex;
          return (
            <li key={step} className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => reached && onStep(step)}
                disabled={!reached}
                aria-current={isCurrent ? 'step' : undefined}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
                  isCurrent
                    ? 'bg-brand-blue-primary text-white shadow-sm'
                    : reached
                      ? 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      : 'bg-slate-100 text-slate-500 cursor-not-allowed'
                }`}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-full text-xs ${
                    isCurrent
                      ? 'bg-white/20'
                      : isDone
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-600'
                  }`}
                  aria-hidden="true"
                >
                  {isDone ? <Check className="w-3 h-3" /> : index + 1}
                </span>
                <span className="hidden sm:inline">
                  {t(STEP_META[step].labelKey, {
                    defaultValue: STEP_META[step].labelDefault,
                  })}
                </span>
              </button>
              {index < MEETING_STEP_ORDER.length - 1 && (
                <span
                  className="w-3 sm:w-6 h-px bg-slate-300"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

// ---------------------------------------------------------------------------
// Pick step
// ---------------------------------------------------------------------------

interface PickStepProps {
  /** Designated common assessments the team can review (already filtered live). */
  cards: AssessmentDataCard[];
  selectedIds: Set<string>;
  onToggle: (assessmentId: string) => void;
  /** Whether the signed-in member may designate/create assessments. */
  canEdit: boolean;
  onDesignate: (card: AssessmentDataCard) => void;
}

export const PlcMeetingPickStep: React.FC<PickStepProps> = ({
  cards,
  selectedIds,
  onToggle,
  canEdit,
  onDesignate,
}) => {
  const { t } = useTranslation();

  const designated = useMemo(
    () => cards.filter((c) => c.isDesignated),
    [cards]
  );
  const undesignated = useMemo(
    () => cards.filter((c) => !c.isDesignated),
    [cards]
  );

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-extrabold text-slate-800">
          {t('plcDashboard.meeting.pick.heading', {
            defaultValue: 'What are we looking at today?',
          })}
        </h2>
        <p className="text-base text-slate-600 mt-1">
          {t('plcDashboard.meeting.pick.subtitle', {
            defaultValue:
              'Choose the common assessment (or assessments) this meeting reviews.',
          })}
        </p>
      </header>

      {cards.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <ClipboardList
            className="w-10 h-10 text-slate-300 mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-base font-bold text-slate-700">
            {t('plcDashboard.meeting.pick.emptyTitle', {
              defaultValue: 'No assessment data yet',
            })}
          </p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            {t('plcDashboard.meeting.pick.emptySubtitle', {
              defaultValue:
                'When the team runs a common assessment in PLC mode, the anonymized results appear here, ready to review together.',
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...designated, ...undesignated].map((card) => {
            const selected = selectedIds.has(card.assessmentId);
            const KindIcon = card.kind === 'video-activity' ? Video : BookOpen;
            return (
              <div
                key={card.assessmentId}
                className={`bg-white border rounded-2xl px-4 py-3.5 flex items-center gap-4 transition-colors ${
                  selected
                    ? 'border-brand-blue-primary ring-1 ring-brand-blue-primary/30'
                    : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onToggle(card.assessmentId)}
                  aria-pressed={selected}
                  className="flex items-center gap-4 flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 rounded-xl"
                >
                  <span
                    className={`flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 transition-colors ${
                      selected
                        ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
                        : 'border-slate-300 text-transparent'
                    }`}
                    aria-hidden="true"
                  >
                    <Check className="w-4 h-4" />
                  </span>
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-blue-primary/10 shrink-0">
                    <KindIcon
                      className="w-5 h-5 text-brand-blue-primary"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-slate-800 truncate">
                        {card.title ||
                          t('plcDashboard.meeting.untitledAssessment', {
                            defaultValue: 'Untitled assessment',
                          })}
                      </span>
                      {card.isDesignated && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-brand-blue-primary bg-brand-blue-primary/10 px-1.5 py-0.5 rounded">
                          <Sparkles className="w-3 h-3" aria-hidden="true" />
                          {t('plcDashboard.meeting.common', {
                            defaultValue: 'Common',
                          })}
                        </span>
                      )}
                    </span>
                    <span className="block text-sm text-slate-500 mt-0.5">
                      {t('plcDashboard.meeting.pick.cardMeta', {
                        defaultValue:
                          '{{avg}}% team avg · {{teachers}} teachers · {{students}} students',
                        avg: card.teamAveragePercent,
                        teachers: card.teacherCount,
                        students: card.studentCount,
                      })}
                    </span>
                  </span>
                </button>

                {!card.isDesignated && canEdit && (
                  <button
                    type="button"
                    onClick={() => onDesignate(card)}
                    className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue-primary hover:text-brand-blue-dark px-2.5 py-1.5 rounded-lg hover:bg-brand-blue-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('plcDashboard.meeting.pick.designate', {
                      defaultValue: 'Designate',
                    })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Decide step
// ---------------------------------------------------------------------------

type Decision = PlcMeeting['decisions'][number];

interface DecideStepProps {
  decisions: Decision[];
  onChange: (decisions: Decision[]) => void;
  /** Assessment titles by id — to render a linked-decision's data-card label. */
  cardTitleById: Readonly<Record<string, string>>;
  canEdit: boolean;
}

export const PlcMeetingDecideStep: React.FC<DecideStepProps> = ({
  decisions,
  onChange,
  cardTitleById,
  canEdit,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const inputId = React.useId();

  const addDecision = (): void => {
    const text = draft.trim();
    if (!text) return;
    onChange([...decisions, { id: crypto.randomUUID(), text }]);
    setDraft('');
  };

  const removeDecision = (id: string): void => {
    onChange(decisions.filter((d) => d.id !== id));
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-extrabold text-slate-800">
          {t('plcDashboard.meeting.decide.heading', {
            defaultValue: 'What did we decide?',
          })}
        </h2>
        <p className="text-base text-slate-600 mt-1">
          {t('plcDashboard.meeting.decide.subtitle', {
            defaultValue:
              'Capture the team’s decisions. Link one to a data card from Review when it responds to a specific result.',
          })}
        </p>
      </header>

      {canEdit && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
          <label
            htmlFor={inputId}
            className="text-sm font-bold text-slate-700 flex items-center gap-2"
          >
            <Lightbulb className="w-4 h-4 text-amber-500" aria-hidden="true" />
            {t('plcDashboard.meeting.decide.addLabel', {
              defaultValue: 'Add a decision',
            })}
          </label>
          <textarea
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                addDecision();
              }
            }}
            rows={2}
            placeholder={t('plcDashboard.meeting.decide.placeholder', {
              defaultValue:
                'e.g. Reteach question 4 using the area model before the unit test.',
            })}
            className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={addDecision}
              disabled={draft.trim().length === 0}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t('plcDashboard.meeting.decide.add', {
                defaultValue: 'Add decision',
              })}
            </button>
          </div>
        </div>
      )}

      {decisions.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t('plcDashboard.meeting.decide.empty', {
            defaultValue: 'No decisions captured yet.',
          })}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {decisions.map((d) => {
            const linkedTitle = d.linkedDataCard
              ? cardTitleById[d.linkedDataCard.assessmentId]
              : undefined;
            return (
              <li
                key={d.id}
                className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-start gap-3"
              >
                <Lightbulb
                  className="w-5 h-5 text-amber-500 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-base text-slate-800 whitespace-pre-wrap break-words">
                    {d.text}
                  </p>
                  {d.linkedDataCard && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue-primary bg-brand-blue-primary/10 px-2 py-0.5 rounded-md">
                      <Link2 className="w-3 h-3" aria-hidden="true" />
                      {linkedTitle ??
                        t('plcDashboard.meeting.decide.linkedFallback', {
                          defaultValue: 'a data card',
                        })}
                      {d.linkedDataCard.questionId &&
                        t('plcDashboard.meeting.decide.linkedQuestion', {
                          defaultValue: ' · Q{{q}}',
                          q: d.linkedDataCard.questionId,
                        })}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeDecision(d.id)}
                    className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-brand-red-primary hover:bg-brand-red-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red-primary/40"
                    aria-label={t('plcDashboard.meeting.decide.remove', {
                      defaultValue: 'Remove decision',
                    })}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Act step
// ---------------------------------------------------------------------------

type ActionItem = PlcMeeting['actionItems'][number];

interface ActStepProps {
  actionItems: ActionItem[];
  onChange: (items: ActionItem[]) => void;
  members: SharedDataTeamMember[];
  canEdit: boolean;
}

/** A date-input value (`yyyy-mm-dd`) → ms at local midnight, or null. */
function dateInputToMs(value: string): number | null {
  if (!value) return null;
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export const PlcMeetingActStep: React.FC<ActStepProps> = ({
  actionItems,
  onChange,
  members,
  canEdit,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [draftAssignee, setDraftAssignee] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const actionInputId = React.useId();
  const assigneeId = React.useId();
  const dueId = React.useId();

  const memberNameByUid = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.uid] = m.displayName;
    return map;
  }, [members]);

  const addItem = (): void => {
    const text = draft.trim();
    if (!text) return;
    const item: ActionItem = { id: crypto.randomUUID(), text };
    if (draftAssignee) item.assigneeUid = draftAssignee;
    const dueMs = dateInputToMs(draftDue);
    if (dueMs != null) item.dueAt = dueMs;
    onChange([...actionItems, item]);
    setDraft('');
    setDraftAssignee('');
    setDraftDue('');
  };

  const removeItem = (id: string): void => {
    onChange(actionItems.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-extrabold text-slate-800">
          {t('plcDashboard.meeting.act.heading', {
            defaultValue: 'Who’s doing what?',
          })}
        </h2>
        <p className="text-base text-slate-600 mt-1">
          {t('plcDashboard.meeting.act.subtitle', {
            defaultValue:
              'Spin up action items. On save, each becomes a tracked PLC to-do for its assignee.',
          })}
        </p>
      </header>

      {canEdit && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
          <label
            htmlFor={actionInputId}
            className="text-sm font-bold text-slate-700 flex items-center gap-2"
          >
            <ListChecks
              className="w-4 h-4 text-brand-blue-primary"
              aria-hidden="true"
            />
            {t('plcDashboard.meeting.act.addLabel', {
              defaultValue: 'Add an action item',
            })}
          </label>
          <input
            id={actionInputId}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder={t('plcDashboard.meeting.act.placeholder', {
              defaultValue: 'e.g. Build a reteach warm-up for question 4',
            })}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={assigneeId}
                className="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                {t('plcDashboard.meeting.act.assignee', {
                  defaultValue: 'Assignee',
                })}
              </label>
              <select
                id={assigneeId}
                value={draftAssignee}
                onChange={(e) => setDraftAssignee(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
              >
                <option value="">
                  {t('plcDashboard.meeting.act.unassigned', {
                    defaultValue: 'Unassigned',
                  })}
                </option>
                {members.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={dueId}
                className="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                {t('plcDashboard.meeting.act.due', { defaultValue: 'Due' })}
              </label>
              <input
                id={dueId}
                type="date"
                value={draftDue}
                onChange={(e) => setDraftDue(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
              />
            </div>
            <button
              type="button"
              onClick={addItem}
              disabled={draft.trim().length === 0}
              className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t('plcDashboard.meeting.act.add', {
                defaultValue: 'Add action',
              })}
            </button>
          </div>
        </div>
      )}

      {actionItems.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t('plcDashboard.meeting.act.empty', {
            defaultValue: 'No action items yet.',
          })}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {actionItems.map((item) => (
            <li
              key={item.id}
              className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-start gap-3"
            >
              <ListChecks
                className="w-5 h-5 text-brand-blue-primary shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-base text-slate-800 break-words">
                  {item.text}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <UserCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    {item.assigneeUid
                      ? (memberNameByUid[item.assigneeUid] ??
                        t('plcDashboard.meeting.act.someone', {
                          defaultValue: 'A teammate',
                        }))
                      : t('plcDashboard.meeting.act.unassigned', {
                          defaultValue: 'Unassigned',
                        })}
                  </span>
                  {item.dueAt != null && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                      {new Date(item.dueAt).toLocaleDateString()}
                    </span>
                  )}
                  {item.todoId && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      {t('plcDashboard.meeting.act.todoCreated', {
                        defaultValue: 'To-do created',
                      })}
                    </span>
                  )}
                </div>
              </div>
              {canEdit && !item.todoId && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-brand-red-primary hover:bg-brand-red-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red-primary/40"
                  aria-label={t('plcDashboard.meeting.act.remove', {
                    defaultValue: 'Remove action item',
                  })}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
