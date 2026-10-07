// Resolves a team's meeting-note template and builds a new meeting note from it (TEAMS_REDESIGN T12, T13, T14).

import type {
  Plc,
  PlcNoteBlock,
  TeamTypeDefaults,
  PlcCommonAssessment,
  PlcAssessmentAggregate,
} from '@/types';
import { getPlcGroupType } from '@/types';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import { dateAggregates } from '@/utils/plcDataOverview';
import { newBlockId } from '@/utils/plcNoteBlocks';
import type {
  MeetingNoteTemplateSection,
  ParsedMeetingNoteTemplate,
} from '@/utils/meetingNoteTemplate';

export type MeetingTemplateSource = 'team' | 'admin' | 'preset' | 'none';

/** The team's own template, else the admin default for its type, else the built-in preset. */
export function resolveMeetingNoteTemplate(
  plc: Pick<Plc, 'groupType' | 'meetingNoteTemplate'>,
  adminDefaults?: TeamTypeDefaults | null
): { markdown: string | null; source: MeetingTemplateSource } {
  if (typeof plc.meetingNoteTemplate === 'string') {
    return plc.meetingNoteTemplate.trim()
      ? { markdown: plc.meetingNoteTemplate, source: 'team' }
      : { markdown: null, source: 'none' };
  }
  const groupType = getPlcGroupType(plc);
  const admin = adminDefaults?.types[groupType];
  if (admin) {
    return admin.meetingNoteTemplate
      ? { markdown: admin.meetingNoteTemplate, source: 'admin' }
      : { markdown: null, source: 'none' };
  }
  const builtIn = BUILT_IN_TEAM_TYPE_PRESETS[groupType].meetingNoteTemplate;
  return builtIn
    ? { markdown: builtIn, source: 'preset' }
    : { markdown: null, source: 'none' };
}

/** Most recent common assessment that has results, for a new Data block. */
export function latestAssessmentWithResults(
  aggregates: readonly PlcAssessmentAggregate[],
  assessments: readonly PlcCommonAssessment[]
): string | null {
  const dated = dateAggregates(aggregates, assessments);
  return dated.length ? dated[dated.length - 1].aggregate.assessmentId : null;
}

export interface MeetingNoteDraft {
  body: string;
  blocks: PlcNoteBlock[];
}

/** Body headings plus the blocks each section kind seeds. */
export function buildMeetingNoteFromTemplate(
  template: ParsedMeetingNoteTemplate,
  ctx: { uid: string; now: number; latestAssessmentId: string | null }
): MeetingNoteDraft {
  const blocks: PlcNoteBlock[] = [];
  const parts: string[] = [];
  if (template.preamble.trim()) parts.push(template.preamble.trim());
  for (const s of template.sections) {
    const heading = s.heading.replace(/\s+/g, ' ').trim();
    if (!heading) continue;
    parts.push(
      s.body.trim() ? `## ${heading}\n\n${s.body.trim()}` : `## ${heading}`
    );
    const base = {
      id: newBlockId(),
      section: heading,
      createdBy: ctx.uid,
      createdAt: ctx.now,
    };
    if (s.kind === 'data') {
      blocks.push({
        ...base,
        kind: 'data',
        assessmentId: ctx.latestAssessmentId,
      });
    } else if (s.kind === 'decision') {
      blocks.push({
        ...base,
        kind: 'decision',
        text: '',
        status: 'open',
        decidedAt: null,
        revisitAt: null,
        link: null,
      });
    }
  }
  return { body: parts.length ? `${parts.join('\n\n')}\n` : '', blocks };
}

const looksLikeActionItems = (heading: string): boolean => {
  const h = heading.trim().toLowerCase();
  return h === 'action items' || h === 'next steps';
};

/** The heading whose section lists action items, or null to list them at the end. */
export function actionItemsSectionOf(
  sections: readonly MeetingNoteTemplateSection[],
  bodyHeadings: readonly string[]
): string | null {
  const fromTemplate = sections.find(
    (s) => s.kind === 'actionItems' && bodyHeadings.includes(s.heading)
  );
  if (fromTemplate) return fromTemplate.heading;
  return bodyHeadings.find(looksLikeActionItems) ?? null;
}
