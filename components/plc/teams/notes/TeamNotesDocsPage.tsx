// Notes & Docs team page: the existing notes body, with its side panels and collapsible list.

import React, { useState } from 'react';
import { NotesDocsBody } from '@/components/plc/bodies/NotesDocsBody';
import { useTeamNav } from '@/components/plc/teams/TeamNavContext';
import type { TeamPageProps } from '@/components/plc/teams/types';
import { takePendingNotesItem } from './teamNotesNavigation';

export default function TeamNotesDocsPage({ plc }: TeamPageProps) {
  const { docId: routeDocId } = useTeamNav();
  const [pending] = useState(() => takePendingNotesItem(plc.id));
  return (
    <div className="h-full">
      <NotesDocsBody
        plc={plc}
        noteId={pending?.kind === 'note' ? pending.id : null}
        docId={pending?.kind === 'doc' ? pending.id : routeDocId}
      />
    </div>
  );
}
