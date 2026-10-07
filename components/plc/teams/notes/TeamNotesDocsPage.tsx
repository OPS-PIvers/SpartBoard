// Notes & Docs team page: the existing notes body, with its side panels and collapsible list.

import React, { useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { NotesDocsBody } from '@/components/plc/bodies/NotesDocsBody';
import { useTeamNav } from '@/components/plc/teams/TeamNavContext';
import type { TeamPageProps } from '@/components/plc/teams/types';
import { takePendingNotesItem } from './teamNotesNavigation';

export default function TeamNotesDocsPage({ plc }: TeamPageProps) {
  const { canAccessFeature } = useAuth();
  const { docId: routeDocId } = useTeamNav();
  const [pending] = useState(() => takePendingNotesItem(plc.id));
  const sidePanels =
    canAccessFeature('plc-notes-unified') &&
    canAccessFeature('plc-notes-side-panels');
  return (
    <div
      className={sidePanels ? 'h-full' : 'h-full overflow-y-auto p-4 md:p-6'}
    >
      <NotesDocsBody
        plc={plc}
        noteId={pending?.kind === 'note' ? pending.id : null}
        docId={pending?.kind === 'doc' ? pending.id : routeDocId}
      />
    </div>
  );
}
