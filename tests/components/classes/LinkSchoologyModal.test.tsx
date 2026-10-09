import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ClassRoster } from '@/types';
import type { SchoologySeenSection } from '@/hooks/useSchoologySeenSections';

vi.mock('@/config/firebase', () => ({ functions: {} }));

const linkMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const suggestMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const previewByUrlMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const linkByUrlMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/utils/ltiCourseLinks', () => ({
  linkLtiCourse: (...args: unknown[]) => linkMock(...args),
  suggestLtiClassLinkMatch: (...args: unknown[]) => suggestMock(...args),
  previewLtiSectionByUrl: (...args: unknown[]) => previewByUrlMock(...args),
  linkLtiSectionByUrl: (...args: unknown[]) => linkByUrlMock(...args),
}));

import { LinkSchoologyModal } from '@/components/classes/LinkSchoologyModal';

const roster = (
  id: string,
  name: string,
  classlinkClassId?: string,
  testClassId?: string
): ClassRoster =>
  ({
    id,
    name,
    students: [],
    classlinkClassId,
    testClassId,
  }) as unknown as ClassRoster;

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

  it('offers an admin test class as a link target without asking for an auto-match', async () => {
    linkMock.mockResolvedValue({ ok: true, contextId: 'ctx-1' });
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[
          roster('rManual', 'Manual class'),
          roster('rTest', 'Mock Period 1 (test)', undefined, 'mock-p1'),
        ]}
        seenSections={[section('ctx-1', 'Model Course: Hour 1')]}
        addToast={addToast}
        updateRoster={updateRoster}
      />
    );
    const select = screen.getByLabelText(/Class for Model Course/i);
    fireEvent.change(select, { target: { value: 'rTest' } });
    fireEvent.click(screen.getByRole('button', { name: /^Link$/i }));
    await waitFor(() => expect(linkMock).toHaveBeenCalledTimes(1));
    expect(linkMock.mock.calls[0][1]).toEqual({
      contextId: 'ctx-1',
      sessionId: 'sess-ctx-1',
      kind: 'quiz',
      testClassId: 'mock-p1',
      rosterId: 'rTest',
    });
    expect(suggestMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(updateRoster).toHaveBeenCalledWith('rTest', {
        ltiContextId: 'ctx-1',
      })
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

  it('hides the paste-link field unless the flag is on', () => {
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[roster('rA', 'Period 1', 'cl-A')]}
        seenSections={[]}
        addToast={addToast}
        updateRoster={updateRoster}
      />
    );
    expect(
      screen.queryByLabelText(/Paste a Schoology course link/i)
    ).toBeNull();
  });

  it('links a pasted course to the class with the most shared students', async () => {
    const url = 'https://orono.schoology.com/course/7660186912/materials';
    previewByUrlMock.mockResolvedValue({
      contextId: '7660186912',
      contextTitle: 'Biology · P2',
      learnerCount: 24,
      suggestions: [{ rosterId: 'rB', overlap: 22 }],
      linkedRosterId: null,
    });
    linkByUrlMock.mockResolvedValue({
      ok: true,
      contextId: '7660186912',
      contextTitle: 'Biology · P2',
    });
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[
          roster('rA', 'Period 1', 'cl-A'),
          roster('rB', 'Period 2', 'cl-B'),
          roster('rT', 'Test class', undefined, 'mock-p1'),
        ]}
        seenSections={[]}
        addToast={addToast}
        updateRoster={updateRoster}
        pasteLinkEnabled
      />
    );
    expect(
      screen.queryByText(/All your Schoology sections are linked/i)
    ).toBeNull();
    fireEvent.change(screen.getByLabelText(/Paste a Schoology course link/i), {
      target: { value: url },
    });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    await waitFor(() => expect(previewByUrlMock).toHaveBeenCalledWith({}, url));

    const select = await screen.findByLabelText(/Class to link/i);
    expect(select).toHaveValue('rB');
    // A class with no shared students can't be picked; test classes are offered too.
    expect(
      screen.getByRole('option', { name: /Period 1 \(no shared students\)/ })
    ).toBeDisabled();
    expect(screen.getByRole('option', { name: /Test class/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Link$/i }));
    await waitFor(() =>
      expect(linkByUrlMock).toHaveBeenCalledWith({}, url, 'rB')
    );
    await waitFor(() =>
      expect(updateRoster).toHaveBeenCalledWith('rB', {
        ltiContextId: '7660186912',
      })
    );
    expect(addToast).toHaveBeenCalledWith(
      'Linked “Biology · P2” to Period 2.',
      'success'
    );
  });

  it('offers the paste field with only admin test classes', () => {
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[roster('rT', 'Test class', undefined, 'mock-p1')]}
        seenSections={[]}
        addToast={addToast}
        updateRoster={updateRoster}
        pasteLinkEnabled
      />
    );
    expect(
      screen.getByLabelText(/Paste a Schoology course link/i)
    ).toBeTruthy();
  });
});
