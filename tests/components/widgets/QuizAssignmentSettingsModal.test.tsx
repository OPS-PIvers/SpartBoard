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

describe('QuizAssignmentSettingsModal — Auto-Generated PLC Sheet toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts ON (URL input hidden) when the assignment has no plc.sheetUrl', () => {
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment()}
        rosters={[] as ClassRoster[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // The Auto-Generated row is visible; the URL input is not rendered.
    expect(screen.getByText('Auto-Generated PLC Sheet')).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/docs\.google\.com\/spreadsheets/i)
    ).not.toBeInTheDocument();
  });

  it('starts OFF (URL input pre-filled) when the assignment already has a plc.sheetUrl (legacy)', () => {
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
  });

  it('toggling Auto-Generated back ON preserves the existing plc.sheetUrl (cancel, not clear)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizAssignmentSettingsModal
        assignment={makePlcAssignment({
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
    // Legacy assignment: toggle starts OFF, URL pre-filled. Click the
    // toggle to turn Auto-Generated back ON — this clears the form input
    // but should NOT clear the saved plc.sheetUrl (the no-op branch in
    // handleAssign preserves the existing linkage when plcSheetUrl saves
    // as ''). Without that branch, saving '' would be dropped by the
    // read-side validator on next snapshot, silently losing PLC mode.
    // Anchor on the label text and walk up to its sibling switch — the
    // ToggleRow renders <span>{label}</span> + <Toggle/> as direct
    // children of the same flex row, so finding the row from the label
    // and querying for [role=switch] inside it gives us the right one
    // even when other toggles (Share with PLC) live in nearby rows.
    const labelEl = screen.getByText('Auto-Generated PLC Sheet');
    const row = labelEl.parentElement; // the flex row
    const autoGenSwitch = row?.querySelector('[role="switch"]');
    expect(autoGenSwitch).not.toBeNull();
    fireEvent.click(autoGenSwitch as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
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
