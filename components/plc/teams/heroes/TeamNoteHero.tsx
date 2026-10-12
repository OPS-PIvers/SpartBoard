// `note` hero (T5): a pinned note, drawn like the Department Hub's note hero.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePlcNotesData } from '@/context/usePlcContext';
import { HeroHead } from '@/components/plc/redesignMockup/DepartmentHubMock';
import { TextLink } from '@/components/plc/redesignMockup/ui';
import { NotesMarkdown } from '@/components/plc/bodies/notesMarkdown';
import {
  formatDayDate,
  formatShortDate,
} from '@/components/plc/teams/notes/noteFormat';
import { openTeamNote } from '@/components/plc/teams/notes/teamNotesNavigation';
import type { TeamHeroProps } from '@/components/plc/teams/types';
import { tourAttr } from '@/config/tourAnchors';

export const TeamNoteHero: React.FC<TeamHeroProps> = ({
  plc,
  heroRef,
  pinnedBy,
  isLead,
  onChangeHero,
}) => {
  const { t } = useTranslation();
  const { data: notes } = usePlcNotesData();
  const noteId = heroRef?.kind === 'note' ? heroRef.noteId : null;
  const note = noteId
    ? notes.find((n) => n.id === noteId && n.deletedAt == null)
    : undefined;
  if (!note) return null;
  const when = note.meetingAt
    ? formatDayDate(note.meetingAt)
    : t('plcDashboard.notes.lastEdited', {
        defaultValue: 'Last edited {{when}}',
        when: formatShortDate(note.lastEditedAt),
      });
  return (
    <>
      <HeroHead
        title={note.title}
        isLead={isLead}
        onChange={onChangeHero}
        meta={
          pinnedBy
            ? `${when} · ${t('plcDataOverview.pinnedBy', {
                name: pinnedBy.name,
                defaultValue: 'Pinned by {{name}}',
              })}`
            : when
        }
        actions={
          <TextLink
            onClick={() => openTeamNote(plc.id, note.id)}
            {...tourAttr('teams.hero.open-note')}
          >
            {t('teams.hub.openNote', { defaultValue: 'Open note' })}
          </TextLink>
        }
      />
      <div className="mt-4 max-h-[28rem] overflow-y-auto pb-6">
        <NotesMarkdown body={note.body} />
      </div>
    </>
  );
};
