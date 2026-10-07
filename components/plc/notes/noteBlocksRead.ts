// Read-only view models for a note's Data, Decision and agenda blocks (legacy Notes and the Google Doc export).

import type {
  LearningTarget,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMember,
  PlcNoteBlock,
  PlcNoteDecisionBlock,
} from '@/types';
import { splitNoteSections } from '@/utils/noteSections';
import { formatShortDate } from '@/components/plc/teams/notes/noteFormat';
import {
  dataBlockModel,
  decisionLinkModel,
} from '@/components/plc/teams/notes/useTeamNotes';

type Translate = (key: string, opts: Record<string, unknown>) => string;

export interface NoteBlockGroup<B extends { section: string }> {
  /** The `## ` heading the blocks sit under; null before the first heading. */
  heading: string | null;
  blocks: B[];
}

/** Blocks grouped under the body section they belong to, in body order; unknown sections join the last one. */
export function groupBlocksBySection<B extends { section: string }>(
  body: string,
  blocks: readonly B[]
): NoteBlockGroup<B>[] {
  const headings = [
    ...new Set(
      splitNoteSections(body)
        .map((s) => s.heading)
        .filter((h): h is string => h !== null)
    ),
  ];
  const known = new Set(headings);
  const orphans = blocks.filter((b) => b.section && !known.has(b.section));
  const last = headings[headings.length - 1] ?? null;
  return [null, ...headings]
    .map((heading) => ({
      heading,
      blocks: [
        ...blocks.filter((b) => b.section === (heading ?? '')),
        ...(heading === last ? orphans : []),
      ],
    }))
    .filter((g) => g.blocks.length > 0);
}

export interface NoteBlockLiveData {
  aggregates: readonly PlcAssessmentAggregate[];
  assessments: readonly PlcCommonAssessment[];
  targets: readonly LearningTarget[];
}

/** Whether showing these blocks needs the team's assessments, results or targets. */
export function noteBlocksNeedLiveData(blocks: readonly PlcNoteBlock[]): {
  results: boolean;
  targets: boolean;
} {
  return {
    results: blocks.some(
      (b) =>
        b.kind === 'data' ||
        (b.kind === 'decision' && b.link?.kind === 'question')
    ),
    targets: blocks.some(
      (b) => b.kind === 'decision' && b.link?.kind === 'target'
    ),
  };
}

export function decisionDateLabel(
  block: PlcNoteDecisionBlock,
  t: Translate
): string {
  return block.status === 'decided'
    ? formatShortDate(block.decidedAt ?? block.createdAt)
    : t('teams.notes.decision.open', { defaultValue: 'Open' });
}

export function decisionRevisitLabel(
  block: PlcNoteDecisionBlock,
  t: Translate
): string | null {
  return block.revisitAt != null
    ? t('teams.notes.decision.revisit', {
        defaultValue: 'Revisit {{date}}',
        date: formatShortDate(block.revisitAt),
      })
    : null;
}

/** One block as plain text for the Google Doc export. */
export type NoteDocBlock =
  | { section: string; kind: 'agenda'; text: string; who: string }
  | { section: string; kind: 'data'; title: string }
  | { section: string; kind: 'decision'; text: string; meta: string[] };

export function noteDocBlocks(
  blocks: readonly PlcNoteBlock[],
  live: NoteBlockLiveData,
  members: readonly PlcMember[],
  t: Translate
): NoteDocBlock[] {
  const out: NoteDocBlock[] = [];
  for (const b of blocks) {
    if (b.kind === 'agenda') {
      if (!b.text.trim()) continue;
      const who = members.find((m) => m.uid === b.createdBy)?.displayName;
      out.push({
        section: b.section,
        kind: 'agenda',
        text: b.text,
        who: who ?? '',
      });
    } else if (b.kind === 'data') {
      const { title } = dataBlockModel(b, live.aggregates, live.assessments);
      if (title) out.push({ section: b.section, kind: 'data', title });
    } else {
      if (!b.text.trim()) continue;
      const link = decisionLinkModel(
        b,
        live.aggregates,
        live.assessments,
        live.targets,
        t
      );
      out.push({
        section: b.section,
        kind: 'decision',
        text: b.text,
        meta: [
          decisionDateLabel(b, t),
          link?.label ?? '',
          link?.detail ?? '',
          decisionRevisitLabel(b, t) ?? '',
        ].filter(Boolean),
      });
    }
  }
  return out;
}
