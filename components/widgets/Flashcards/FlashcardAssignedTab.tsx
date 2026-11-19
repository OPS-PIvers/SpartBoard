import React from 'react';
import type { DocumentData } from 'firebase/firestore';
import { Monitor } from 'lucide-react';
import type { ClassRoster, FlashcardAssignment } from '@/types';
import type { LibraryMenuAction } from '@/components/common/library/types';
import { RunAssignedTab } from '@/components/common/library/assigned/RunAssignedTab';
import {
  flashcardAssignedInput,
  flashcardAssignedResponse,
} from '@/utils/assignedAdapters';
import {
  FLASHCARD_CLASS_COLLECTIONS,
  type FlashcardLifecycle,
} from './utils/flashcardClassLifecycle';
import { flashcardAssignmentSubtitle } from './utils/flashcardAssignmentRow';

export interface FlashcardAssignedHandlers {
  onMonitor: (a: FlashcardAssignment) => void;
  onResults: (a: FlashcardAssignment) => void;
  onPublish: (a: FlashcardAssignment) => void;
  /** The row's other menu items (Settings, Share, scores, Delete). */
  menu: (a: FlashcardAssignment) => LibraryMenuAction[];
}

interface FlashcardAssignedTabProps extends FlashcardAssignedHandlers {
  assignments: FlashcardAssignment[];
  loading: boolean;
  rosters: ClassRoster[];
  lifecycle: FlashcardLifecycle;
  /** Deletes without asking; resolves to how many failed. */
  onBulkDelete?: (assignments: FlashcardAssignment[]) => Promise<number>;
}

const isCheck = (a: FlashcardAssignment) => a.kind === 'check';

const toResponses = (_a: FlashcardAssignment, docs: DocumentData[]) =>
  docs.map((d) =>
    flashcardAssignedResponse({
      classId: d.classId as string,
      submittedAt: d.submittedAt as number | undefined,
    })
  );

/** The Flashcards Assigned tab on the shared run tab (ASSIGNED_TAB.md slice 5). */
export const FlashcardAssignedTab: React.FC<FlashcardAssignedTabProps> = ({
  assignments,
  loading,
  rosters,
  lifecycle,
  onMonitor,
  onResults,
  onPublish,
  menu,
  onBulkDelete,
}) => (
  <RunAssignedTab<FlashcardAssignment>
    assignments={assignments}
    loading={loading}
    rosters={rosters}
    collections={FLASHCARD_CLASS_COLLECTIONS}
    lifecycle={lifecycle}
    tourWidgetType="flashcards"
    emptyTitle="Nothing assigned yet"
    emptySub="Assign a set from the Library."
    title={(a) => a.setTitle || 'Untitled set'}
    viewOnly={() => false}
    toInput={flashcardAssignedInput}
    responsesPath={(a) => `flashcard_sessions/${a.sessionId || a.id}/progress`}
    toResponses={toResponses}
    onMonitor={onMonitor}
    onResults={onResults}
    onPublish={onPublish}
    fallbackPrimary={() => null}
    // D7: Monitor is always one menu row away, and opening it changes nothing.
    menu={(a) => [
      {
        id: 'monitor',
        label: 'Monitor',
        icon: Monitor,
        onClick: () => onMonitor(a),
      },
      ...menu(a),
    ]}
    replacedMenuIds={[]}
    publishes={isCheck}
    submits={isCheck}
    footerLead={flashcardAssignmentSubtitle}
    onBulkDelete={onBulkDelete}
  />
);
