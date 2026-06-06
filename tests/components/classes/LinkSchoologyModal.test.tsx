import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ClassRoster } from '@/types';
import type { SchoologySeenSection } from '@/hooks/useSchoologySeenSections';

vi.mock('@/config/firebase', () => ({ functions: {} }));

const linkMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const suggestMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/utils/ltiCourseLinks', () => ({
  linkLtiCourse: (...args: unknown[]) => linkMock(...args),
  suggestLtiClassLinkMatch: (...args: unknown[]) => suggestMock(...args),
}));

import { LinkSchoologyModal } from '@/components/classes/LinkSchoologyModal';

const roster = (
  id: string,
  name: string,
  classlinkClassId?: string
): ClassRoster =>
  ({ id, name, students: [], classlinkClassId }) as unknown as ClassRoster;

const section = (
  contextId: string,
  contextTitle: string
): SchoologySeenSection => ({
  contextId,
  contextTitle,
  sessionId: `sess-${contextId}`,
  kind: 'quiz',
});

const addToast = vi.fn();
const updateRoster = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  updateRoster.mockResolvedValue(undefined);
});

describe('LinkSchoologyModal', () => {
  it('auto-selects the suggested ClassLink class and links it (carrying the trust-anchor sessionId)', async () => {
    suggestMock.mockResolvedValue({
      suggestion: { classlinkClassId: 'cl-B', overlap: 3, ratio: 1 },
      ambiguous: false,
    });
    linkMock.mockResolvedValue({ ok: true, contextId: 'ctx-1' });

    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[
          roster('rA', 'Period 1', 'cl-A'),
          roster('rB', 'Period 2', 'cl-B'),
          roster('rManual', 'Manual class'), // no classlinkClassId → not a candidate
        ]}
        seenSections={[section('ctx-1', 'Algebra 1 · P1')]}
        addToast={addToast}
        updateRoster={updateRoster}
      />
    );

    // The suggest CF is asked once with ONLY the ClassLink rosters as candidates.
    await waitFor(() => expect(suggestMock).toHaveBeenCalledTimes(1));
    const suggestArgs = suggestMock.mock.calls[0][1] as {
      contextId: string;
      candidates: { classlinkClassId: string }[];
    };
    expect(suggestArgs.contextId).toBe('ctx-1');
    expect(suggestArgs.candidates).toEqual([
      { classlinkClassId: 'cl-A' },
      { classlinkClassId: 'cl-B' },
    ]);

    // The select lands on the suggested roster (Period 2 / cl-B).
    const select = screen.getByLabelText(/Class for Algebra 1/i);
    await waitFor(() => expect(select).toHaveValue('rB'));

    fireEvent.click(screen.getByRole('button', { name: /^Link$/i }));

    await waitFor(() => expect(linkMock).toHaveBeenCalledTimes(1));
    expect(linkMock.mock.calls[0][1]).toMatchObject({
      contextId: 'ctx-1',
      sessionId: 'sess-ctx-1',
      kind: 'quiz',
      classlinkClassId: 'cl-B',
      rosterId: 'rB',
    });
    // Mirrors the link onto the roster for link-state display.
    await waitFor(() =>
      expect(updateRoster).toHaveBeenCalledWith('rB', { ltiContextId: 'ctx-1' })
    );
    expect(addToast.mock.calls.some(([, type]) => type === 'success')).toBe(
      true
    );
  });

  it('prompts to import ClassLink classes when the teacher has none', () => {
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[roster('rManual', 'Manual class')]}
        seenSections={[section('ctx-1', 'Algebra 1 · P1')]}
        addToast={addToast}
        updateRoster={updateRoster}
      />
    );
    expect(
      screen.getByText(/Import your classes from ClassLink first/i)
    ).toBeInTheDocument();
    expect(suggestMock).not.toHaveBeenCalled();
  });

  it('shows the all-linked empty state when nothing is left to link', () => {
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        // The roster already mirrors ctx-1, so the section is filtered out.
        rosters={[
          { ...roster('rB', 'Period 2', 'cl-B'), ltiContextId: 'ctx-1' },
        ]}
        seenSections={[section('ctx-1', 'Algebra 1 · P1')]}
        addToast={addToast}
        updateRoster={updateRoster}
      />
    );
    expect(
      screen.getByText(/All your Schoology sections are linked/i)
    ).toBeInTheDocument();
  });
});
