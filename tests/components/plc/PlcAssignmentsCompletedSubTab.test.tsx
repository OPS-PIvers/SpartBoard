/**
 * Tests for PlcAssignmentsCompletedSubTab — kindFilter scoping (C3).
 *
 * The Completed sub-tab is a read-only history of `inactive` PLC-mode
 * assignments. It gained an optional `kindFilter` prop: when set, only
 * index entries whose `kind` matches render. These cases cover that
 * filtering over `inactive`-status entries.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import { PlcAssignmentsCompletedSubTab } from '@/components/plc/tabs/PlcAssignmentsCompletedSubTab';
import type { Plc, PlcAssignmentIndexEntry } from '@/types';

// ---------------------------------------------------------------------------
// i18n stub
// ---------------------------------------------------------------------------
beforeAll(() => {
  void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} } },
    interpolation: { escapeValue: false },
  });
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Completed entries: a mix of quiz and video-activity, all `inactive` so the
// only thing scoping them is the kindFilter. Mutable so each test can swap
// the dataset; reset in beforeEach.
const quizEntry: PlcAssignmentIndexEntry = {
  id: 'done-quiz-1',
  kind: 'quiz',
  ownerUid: 'owner-1',
  ownerName: 'Teacher One',
  ownerEmail: 'one@example.com',
  title: 'Completed Photosynthesis Quiz',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/done1',
  status: 'inactive',
  createdAt: 1_000_000,
};

const videoEntry: PlcAssignmentIndexEntry = {
  id: 'done-video-1',
  kind: 'video-activity',
  ownerUid: 'owner-1',
  ownerName: 'Teacher One',
  ownerEmail: 'one@example.com',
  title: 'Completed Cell Cycle Video',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/done2',
  status: 'inactive',
  createdAt: 2_000_000,
};

const DEFAULT_INDEX_ENTRIES: PlcAssignmentIndexEntry[] = [
  quizEntry,
  videoEntry,
];
let indexEntries: PlcAssignmentIndexEntry[] = DEFAULT_INDEX_ENTRIES;

vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  usePlcAssignmentIndex: () => ({
    entries: indexEntries,
    loading: false,
    error: null,
  }),
}));

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const plc = {
  id: 'plc-1',
  name: 'Test PLC',
  leadUid: 'owner-1',
  memberUids: ['owner-1'],
} as unknown as Plc;

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

const renderSubject = (
  props: Partial<
    React.ComponentProps<typeof PlcAssignmentsCompletedSubTab>
  > = {}
) =>
  render(
    <I18nextProvider i18n={i18n}>
      <PlcAssignmentsCompletedSubTab plc={plc} {...props} />
    </I18nextProvider>
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcAssignmentsCompletedSubTab — kindFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    indexEntries = DEFAULT_INDEX_ENTRIES;
  });

  it('renders only quiz rows when kindFilter="quiz"', () => {
    renderSubject({ kindFilter: 'quiz' });

    expect(screen.getByText(quizEntry.title)).toBeInTheDocument();
    expect(screen.queryByText(videoEntry.title)).not.toBeInTheDocument();
  });

  it('renders only video-activity rows when kindFilter="video-activity"', () => {
    renderSubject({ kindFilter: 'video-activity' });

    expect(screen.getByText(videoEntry.title)).toBeInTheDocument();
    expect(screen.queryByText(quizEntry.title)).not.toBeInTheDocument();
  });

  it('renders all kinds when kindFilter is undefined', () => {
    renderSubject();

    expect(screen.getByText(quizEntry.title)).toBeInTheDocument();
    expect(screen.getByText(videoEntry.title)).toBeInTheDocument();
  });
});
