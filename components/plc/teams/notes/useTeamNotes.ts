// Data hooks for team notes: the meeting-note template, block view-models and each member's "My items".

import { useCallback, useMemo, useState } from 'react';
import type {
  LearningTarget,
  Plc,
  PlcActionItem,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcNote,
  PlcNoteDataBlock,
  PlcNoteDecisionBlock,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useTeamTypeDefaults } from '@/hooks/useTeamLayout';
import { usePlcNotes } from '@/hooks/usePlcNotes';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import {
  parseMeetingNoteTemplate,
  type MeetingNoteTemplateSection,
  type ParsedMeetingNoteTemplate,
} from '@/utils/meetingNoteTemplate';
import {
  resolveMeetingNoteTemplate,
  type MeetingTemplateSource,
} from '@/utils/meetingNoteBuild';
import {
  selectMemberActionItems,
  type TeamActionItemView,
} from '@/utils/plcNoteBlocks';
import {
  buildItemAnalysis,
  type ItemAnalysisQuestion,
} from '@/utils/plcDataOverview';
import { firstNonEmpty } from '@/components/plc/assessments/assessmentListSelectors';
import { logError } from '@/utils/logError';

export interface TeamMeetingTemplate {
  parsed: ParsedMeetingNoteTemplate;
  sections: MeetingNoteTemplateSection[];
  markdown: string | null;
  source: MeetingTemplateSource;
  loading: boolean;
}

/** The team's meeting-note template: its own, else `admin_settings/team_type_defaults`, else the built-in preset (T12). */
export function useTeamMeetingTemplate(
  plc: Pick<Plc, 'groupType' | 'meetingNoteTemplate'>
): TeamMeetingTemplate {
  const defaults = useTeamTypeDefaults(true);
  return useMemo(() => {
    const { markdown, source } = resolveMeetingNoteTemplate(plc, defaults);
    const parsed = parseMeetingNoteTemplate(markdown ?? '');
    return {
      parsed,
      sections: parsed.sections,
      markdown,
      source,
      loading: defaults === null,
    };
  }, [plc, defaults]);
}

export interface DataBlockModel {
  title: string | null;
  teamAveragePercent: number | null;
  scoredStudents: number | null;
  totalStudents: number;
  questions: ItemAnalysisQuestion[];
}

/** The three questions to talk about first, from the live aggregate (T13). */
export function dataBlockModel(
  block: Pick<PlcNoteDataBlock, 'assessmentId'>,
  aggregates: readonly PlcAssessmentAggregate[],
  assessments: readonly PlcCommonAssessment[]
): DataBlockModel {
  const aggregate = block.assessmentId
    ? aggregates.find((a) => a.assessmentId === block.assessmentId)
    : undefined;
  const assessment = block.assessmentId
    ? assessments.find((a) => a.id === block.assessmentId)
    : undefined;
  const title = firstNonEmpty([assessment?.title, aggregate?.title]) ?? null;
  if (!aggregate) {
    return {
      title,
      teamAveragePercent: null,
      scoredStudents: null,
      totalStudents: 0,
      questions: [],
    };
  }
  const analysis = buildItemAnalysis(aggregate);
  return {
    title,
    teamAveragePercent: analysis.headline.teamAveragePercent,
    scoredStudents: analysis.headline.participation.scoredStudents,
    totalStudents: analysis.headline.participation.totalStudents,
    questions: analysis.questions
      .filter((q) => q.status === 'scored')
      .slice(0, 3),
  };
}

export interface DecisionLinkModel {
  label: string;
  detail: string | null;
  assessmentId: string | null;
}

/** "Q5 Complex fraction rate · Unit 3 Ratios CFA" plus its live result, or the target's code and label (T14). */
export function decisionLinkModel(
  block: Pick<PlcNoteDecisionBlock, 'link'>,
  aggregates: readonly PlcAssessmentAggregate[],
  assessments: readonly PlcCommonAssessment[],
  targets: readonly LearningTarget[],
  t: (key: string, opts: Record<string, unknown>) => string
): DecisionLinkModel | null {
  const link = block.link;
  if (!link) return null;
  if (link.kind === 'target') {
    const target = targets.find((x) => x.id === link.targetId);
    if (!target) return null;
    return {
      label: target.code ? `${target.code} ${target.label}` : target.label,
      detail: null,
      assessmentId: null,
    };
  }
  const aggregate = aggregates.find(
    (a) => a.assessmentId === link.assessmentId
  );
  const assessment = assessments.find((a) => a.id === link.assessmentId);
  const title = firstNonEmpty([assessment?.title, aggregate?.title]) ?? '';
  if (!aggregate) {
    return title
      ? { label: title, detail: null, assessmentId: link.assessmentId }
      : null;
  }
  const q = buildItemAnalysis(aggregate).questions.find(
    (x) => x.questionId === link.questionId
  );
  if (!q)
    return { label: title, detail: null, assessmentId: link.assessmentId };
  const detail =
    q.correctPercent !== null && q.dominantWrong
      ? t('teams.notes.decision.linkDetail', {
          defaultValue: '{{pct}}% correct · most chose {{answer}}, {{wrong}}%',
          pct: q.correctPercent,
          answer: q.dominantWrong.label,
          wrong: q.dominantWrong.percent,
        })
      : null;
  return {
    label: `Q${q.number} ${q.text}${title ? ` · ${title}` : ''}`,
    detail,
    assessmentId: link.assessmentId,
  };
}

export interface TeamMyItems {
  items: TeamActionItemView[];
  count: number;
  loading: boolean;
  /** Marks one item done (or not) on its note or linked doc. */
  setDone: (view: TeamActionItemView, done: boolean) => Promise<void>;
}

/** The signed-in member's open action items in one team, for the shell's "My items" drawer (T10, T14). */
export function useTeamMyItems(plc: Pick<Plc, 'id'>): TeamMyItems {
  const { user } = useAuth();
  const { notes, loading, updateNote } = usePlcNotes(plc.id);
  const { docs, loading: docsLoading, updateDoc } = usePlcDocs(plc.id);
  const uid = user?.uid ?? null;
  const items = useMemo(
    () => selectMemberActionItems(notes, docs, uid),
    [notes, docs, uid]
  );
  const setDone = useCallback(
    async (view: TeamActionItemView, done: boolean) => {
      const flip = (list: PlcActionItem[] | undefined) =>
        (list ?? []).map((i) =>
          i.id === view.item.id
            ? { ...i, done, doneAt: done ? Date.now() : null }
            : i
        );
      try {
        if (view.source.kind === 'note') {
          const note: PlcNote = view.source.note;
          await updateNote(
            note.id,
            { actionItems: flip(note.actionItems) },
            { expectedVersion: note.version }
          );
        } else {
          const doc = view.source.doc;
          await updateDoc(doc.id, {
            actionItems: flip(doc.actionItems),
            actionItemsBase: doc.actionItems ?? [],
          });
        }
      } catch (err) {
        logError('useTeamMyItems.setDone', err, { plcId: plc.id });
        throw err;
      }
    },
    [plc.id, updateNote, updateDoc]
  );
  return {
    items,
    count: items.length,
    loading: loading || docsLoading,
    setDone,
  };
}

/** Day-stable "now" for due and revisit labels. */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}
