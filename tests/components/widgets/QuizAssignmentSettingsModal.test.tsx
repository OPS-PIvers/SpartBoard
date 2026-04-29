import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuizAssignmentSettingsModal } from '@/components/widgets/QuizWidget/components/QuizAssignmentSettingsModal';
import type { ClassRoster, QuizAssignment } from '@/types';

function makePlcAssignment(
  overrides: Partial<QuizAssignment> = {}
): QuizAssignment {
  return {
    id: 'a1',
    quizId: 'q1',
    quizTitle: 'PLC Quiz',
    quizDriveFileId: 'drive1',
    teacherUid: 'teacher-1',
    code: 'ABC123',
    status: 'paused',
    createdAt: 1,
    updatedAt: 1,
    sessionMode: 'teacher',
    sessionOptions: {},
    // Mirror the new PlcLinkage sub-object shape — `plcMode` is now derived
    // as `!!assignment.plc`, and the sheet URL lives on `plc.sheetUrl`.
    plc: {
      id: 'plc-1',
      name: 'Test PLC',
      sheetUrl: '',
      memberEmails: [],
    },
    teacherName: '',
    periodNames: [],
    ...overrides,
  } as unknown as QuizAssignment;
}

describe('QuizAssignmentSettingsModal — sheet URL disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts collapsed when the assignment has no plc.sheetUrl', () => {
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment()}
        rosters={[] as ClassRoster[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: /Manually attach a sheet URL/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/docs\.google\.com\/spreadsheets/i)
    ).not.toBeInTheDocument();
  });

  it('starts expanded when the assignment already has a plc.sheetUrl (legacy)', () => {
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          plc: {
            id: 'plc-1',
            name: 'Test PLC',
            sheetUrl: 'https://docs.google.com/spreadsheets/d/legacy-sheet-id',
            memberEmails: [],
          },
        })}
        rosters={[] as ClassRoster[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // Field is rendered with the legacy URL pre-populated.
    expect(screen.getByDisplayValue(/legacy-sheet-id/)).toBeInTheDocument();
    // No disclosure button when expanded.
    expect(
      screen.queryByRole('button', { name: /Manually attach a sheet URL/i })
    ).not.toBeInTheDocument();
  });

  it('clicking "Hide" preserves the existing plc.sheetUrl (cancel, not clear)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
          // status must be 'inactive' for Save to be enabled when
          // the modeLocked path keeps everything else editable —
          // 'paused' still allows save here since the modal's
          // confirm gate is permissive.
          plc: {
            id: 'plc-1',
            name: 'Test PLC',
            sheetUrl: 'https://docs.google.com/spreadsheets/d/legacy-sheet-id',
            memberEmails: ['a@example.com'],
          },
        })}
        rosters={[] as ClassRoster[]}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Hide/i }));
    // Save (the modal's confirm button label is just "Save").
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // Hide is a cancel: the form input was cleared, but the saved plc keeps
    // the existing sheetUrl. Saving an empty sheetUrl would be dropped by
    // the read-side validator on next snapshot, silently losing PLC mode.
    expect(onSave.mock.calls[0][0]).toMatchObject({
      plc: {
        id: 'plc-1',
        name: 'Test PLC',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/legacy-sheet-id',
        memberEmails: ['a@example.com'],
      },
    });
  });
});
