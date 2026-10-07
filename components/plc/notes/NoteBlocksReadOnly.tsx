// A note's Data, Decision and agenda blocks shown read-only under the legacy note editor.

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PlcMember, PlcNoteBlock } from '@/types';
import { META } from '@/components/plc/redesignMockup/ui';
import {
  AgendaRow,
  DataBlockView,
  DecisionBlockView,
} from '@/components/plc/teams/notes/NoteBlockViews';
import {
  dataBlockModel,
  decisionLinkModel,
} from '@/components/plc/teams/notes/useTeamNotes';
import {
  decisionDateLabel,
  decisionRevisitLabel,
  groupBlocksBySection,
  type NoteBlockLiveData,
} from './noteBlocksRead';

export const NoteBlocksReadOnly: React.FC<{
  body: string;
  blocks: readonly PlcNoteBlock[];
  members: readonly PlcMember[];
  live: NoteBlockLiveData;
}> = ({ body, blocks, members, live }) => {
  const { t } = useTranslation();
  const shown = blocks.filter(
    (b) => b.kind === 'data' || b.text.trim().length > 0
  );
  const groups = groupBlocksBySection(body, shown);
  if (!groups.length) return null;
  const memberName = (uid: string) =>
    members.find((m) => m.uid === uid)?.displayName ?? '';

  return (
    <div className="space-y-4 px-4 pb-4" data-testid="note-blocks">
      {groups.map((group) => {
        const agenda = group.blocks.filter((b) => b.kind === 'agenda');
        return (
          <section key={group.heading ?? ''} className="space-y-2">
            {group.heading && (
              <p className={`${META} font-semibold`}>{group.heading}</p>
            )}
            {agenda.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {agenda.map((b) => (
                  <AgendaRow
                    key={b.id}
                    text={b.kind === 'agenda' ? b.text : ''}
                    who={memberName(b.createdBy)}
                  />
                ))}
              </ul>
            )}
            {group.blocks.map((b) => {
              if (b.kind === 'data') {
                return (
                  <DataBlockView
                    key={b.id}
                    {...dataBlockModel(b, live.aggregates, live.assessments)}
                  />
                );
              }
              if (b.kind !== 'decision') return null;
              const link = decisionLinkModel(
                b,
                live.aggregates,
                live.assessments,
                live.targets,
                t
              );
              return (
                <DecisionBlockView
                  key={b.id}
                  text={b.text}
                  dateLabel={decisionDateLabel(b, t)}
                  linkLabel={link?.label ?? null}
                  linkDetail={link?.detail ?? null}
                  revisitLabel={decisionRevisitLabel(b, t)}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
};
