/**
 * MediaReviewDevHarness — DEV-only visual harness for the org-admin student
 * media review console (Brief 4.1).
 *
 * The real console is backed by two Admin-SDK callables over production quiz
 * sessions, so there is no safe way to see its loading / empty / error /
 * partial-failure states without real student data. This harness renders the
 * presentational `MediaReviewView` against fixtures instead.
 *
 * Mounted at /media-review-dev in DEV builds only (same gating pattern as the
 * other harnesses in this directory) — excluded from production bundles.
 */

import React, { useState } from 'react';
import { MediaReviewView } from '@/components/admin/Organization/views/MediaReviewView';
import {
  EMPTY_MEDIA_FILTERS,
  type MediaDeleteResult,
  type MediaResponseRow,
  type MediaReviewFilters,
  type MediaTeacherOption,
} from '@/hooks/useOrgMediaResponses';

const TEACHERS: MediaTeacherOption[] = [
  { uid: 't1', email: 'r.alvarez@orono.k12.mn.us' },
  { uid: 't2', email: 'j.chen@orono.k12.mn.us' },
];

const DAY = 86400000;
const BASE = Date.UTC(2026, 7, 24, 15, 30);

const ROWS: MediaResponseRow[] = [
  {
    sessionId: 's1',
    responseKey: 'r1',
    questionId: 'q-fractions-3',
    quizTitle: 'Fractions Review — Unit 4',
    teacherUid: 't1',
    teacherEmail: 'r.alvarez@orono.k12.mn.us',
    studentLabel: 'Pin 4821',
    lastActivityAt: BASE,
    takes: [
      {
        artifactId: 'a1',
        archiveStatus: 'archived',
        driveFileId: 'drive-a1',
        archivedAt: BASE - 600000,
        hasStorageObject: false,
      },
      {
        artifactId: 'a2',
        archiveStatus: 'archived',
        driveFileId: 'drive-a2',
        archivedAt: BASE,
        hasStorageObject: false,
      },
    ],
  },
  {
    sessionId: 's1',
    responseKey: 'r2',
    questionId: 'q-fractions-3',
    quizTitle: 'Fractions Review — Unit 4',
    teacherUid: 't1',
    teacherEmail: 'r.alvarez@orono.k12.mn.us',
    studentLabel: 'Pin 9104',
    lastActivityAt: BASE - DAY,
    takes: [
      {
        artifactId: 'b1',
        archiveStatus: 'delete-failed',
        driveFileId: 'drive-b1',
        archiveError:
          "Teacher's Google account is disconnected; the file cannot be deleted remotely.",
        hasStorageObject: false,
      },
    ],
  },
  {
    sessionId: 's2',
    responseKey: 'r3',
    questionId: 'q-westward-1',
    quizTitle: 'Westward Expansion Checkpoint',
    teacherUid: 't2',
    teacherEmail: 'j.chen@orono.k12.mn.us',
    studentLabel: 'Student 8f21ba0c',
    lastActivityAt: BASE - 3 * DAY,
    takes: [
      {
        artifactId: 'c1',
        archiveStatus: 'failed',
        hasStorageObject: true,
      },
      {
        artifactId: 'c2',
        archiveStatus: 'deleted',
        driveFileId: 'drive-c2',
        deletedAt: BASE - 3 * DAY,
        hasStorageObject: false,
      },
    ],
  },
];

const RESULTS: MediaDeleteResult[] = [
  {
    sessionId: 's1',
    responseKey: 'r1',
    questionId: 'q-fractions-3',
    artifactId: 'a1',
    status: 'deleted',
  },
  {
    sessionId: 's1',
    responseKey: 'r1',
    questionId: 'q-fractions-3',
    artifactId: 'a2',
    status: 'deleted',
  },
  {
    sessionId: 's1',
    responseKey: 'r2',
    questionId: 'q-fractions-3',
    artifactId: 'b1',
    status: 'failed',
    error:
      "Teacher's Google account is disconnected; the file cannot be deleted remotely.",
  },
];

type HarnessState =
  | 'loaded'
  | 'loading'
  | 'empty'
  | 'error'
  | 'truncated'
  | 'deleting'
  | 'results';

const STATES: Array<{ id: HarnessState; label: string }> = [
  { id: 'loaded', label: 'Loaded' },
  { id: 'loading', label: 'Loading' },
  { id: 'empty', label: 'Empty' },
  { id: 'error', label: 'Error' },
  { id: 'truncated', label: 'Truncated' },
  { id: 'deleting', label: 'Delete in progress' },
  { id: 'results', label: 'Partial failure' },
];

export const MediaReviewDevHarness: React.FC = () => {
  const [state, setState] = useState<HarnessState>('loaded');
  const [filters, setFilters] =
    useState<MediaReviewFilters>(EMPTY_MEDIA_FILTERS);

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-[1200px] mx-auto">
        <h1 className="text-lg font-bold text-slate-900">
          Media review console — dev harness
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Fixtures only. No Firestore, no Drive, no callable.
        </p>
        <div className="flex flex-wrap gap-2 my-4">
          {STATES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setState(s.id)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                state === s.id
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
          <MediaReviewView
            rows={state === 'empty' || state === 'error' ? [] : ROWS}
            teachers={TEACHERS}
            loading={state === 'loading'}
            error={
              state === 'error'
                ? 'permission-denied: Caller is not an administrator for this organization.'
                : null
            }
            truncated={state === 'truncated'}
            deleting={state === 'deleting'}
            filters={filters}
            results={state === 'results' ? RESULTS : null}
            onFiltersChange={setFilters}
            onReload={() => undefined}
            onDismissResults={() => setState('loaded')}
            onDelete={() => setState('results')}
          />
        </div>
      </div>
    </div>
  );
};
