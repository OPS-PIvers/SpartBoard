import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ClassRoster } from '@/types';
import type { SchoologySeenSection } from '@/hooks/useSchoologySeenSections';

vi.mock('@/config/firebase', () => ({ functions: {} }));

const linkMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const suggestMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const previewByUrlMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const linkByUrlMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const unlinkMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const findMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const linkFoundMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/utils/ltiCourseLinks', () => ({
  replacedNote: (replaced?: string[]) =>
    replaced?.length
      ? ` Replaced ${replaced.map((t) => `“${t}”`).join(', ')}.`
      : '',
  linkLtiCourse: (...args: unknown[]) => linkMock(...args),
  suggestLtiClassLinkMatch: (...args: unknown[]) => suggestMock(...args),
  previewLtiSectionByUrl: (...args: unknown[]) => previewByUrlMock(...args),
  linkLtiSectionByUrl: (...args: unknown[]) => linkByUrlMock(...args),
  unlinkLtiSection: (...args: unknown[]) => unlinkMock(...args),
  findSchoologySections: (...args: unknown[]) => findMock(...args),
  linkFoundSchoologySections: (...args: unknown[]) => linkFoundMock(...args),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1' } }),
}));
let courseLinks: {
  contextId: string;
  contextTitle: string | null;
  rosterId: string | null;
}[] = [];
vi.mock('@/hooks/useSchoologyCourseLinks', () => ({
  useSchoologyCourseLinks: () => courseLinks,
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
  courseLinks = [];
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

  it('names the replaced section when a re-link replaces an earlier one', async () => {
    const url = 'https://orono.schoology.com/course/8497590559/materials';
    previewByUrlMock.mockResolvedValue({
      contextId: '8497590559',
      contextTitle: 'Biology A (S1)',
      learnerCount: 24,
      suggestions: [{ rosterId: 'rA', overlap: 22 }],
      linkedRosterId: null,
    });
    linkByUrlMock.mockResolvedValue({
      ok: true,
      contextId: '8497590559',
      contextTitle: 'Biology A (S1)',
      replaced: ['Biology B (S2)'],
      replacedIds: ['ctx-s2'],
    });
    const dup = {
      ...roster('rDup', 'Period 5 copy', 'cl-A'),
      ltiContextId: 'ctx-s2',
    } as ClassRoster;
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[roster('rA', 'Period 5', 'cl-A'), dup]}
        seenSections={[]}
        addToast={addToast}
        updateRoster={updateRoster}
        pasteLinkEnabled
      />
    );
    fireEvent.change(screen.getByLabelText(/Paste a Schoology course link/i), {
      target: { value: url },
    });
    fireEvent.click(screen.getByRole('button', { name: /Check/i }));
    await screen.findByLabelText(/Class to link/i);
    fireEvent.click(screen.getByRole('button', { name: /^Link$/i }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'Linked “Biology A (S1)” to Period 5. Replaced “Biology B (S2)”.',
        'success'
      )
    );
    expect(updateRoster).toHaveBeenCalledWith('rDup', { ltiContextId: '' });
  });

  it('lists linked courses and unlinks one, clearing the class mirror', async () => {
    courseLinks = [
      { contextId: 'ctx-s1', contextTitle: 'Biology A (S1)', rosterId: 'rA' },
    ];
    unlinkMock.mockResolvedValue({ ok: true, contextId: 'ctx-s1' });
    const linked = {
      ...roster('rA', 'Period 5', 'cl-A'),
      ltiContextId: 'ctx-s1',
    } as ClassRoster;
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[linked]}
        seenSections={[]}
        addToast={addToast}
        updateRoster={updateRoster}
        pasteLinkEnabled
      />
    );
    expect(screen.getByText('Linked courses')).toBeTruthy();
    expect(screen.getByText('Period 5')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Unlink Biology A (S1)' })
    );
    await waitFor(() => expect(unlinkMock).toHaveBeenCalledWith({}, 'ctx-s1'));
    await waitFor(() =>
      expect(updateRoster).toHaveBeenCalledWith('rA', { ltiContextId: '' })
    );
    expect(addToast).toHaveBeenCalledWith(
      'Unlinked “Biology A (S1)”.',
      'success'
    );
  });

  it('hides the linked courses list unless the flag is on', () => {
    courseLinks = [
      { contextId: 'ctx-s1', contextTitle: 'Biology A (S1)', rosterId: 'rA' },
    ];
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[roster('rA', 'Period 5', 'cl-A')]}
        seenSections={[]}
        addToast={addToast}
        updateRoster={updateRoster}
      />
    );
    expect(screen.queryByText('Linked courses')).toBeNull();
  });

  it('puts a section linked then unlinked in this dialog back on the list', async () => {
    suggestMock.mockResolvedValue({ suggestion: null });
    linkMock.mockResolvedValue({ ok: true, contextId: 'ctx-1' });
    unlinkMock.mockResolvedValue({ ok: true, contextId: 'ctx-1' });
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      rosters: [roster('rA', 'Period 1', 'cl-A')],
      seenSections: [section('ctx-1', 'Algebra 1 · P1')],
      addToast,
      updateRoster,
      pasteLinkEnabled: true,
    };
    const { rerender } = render(<LinkSchoologyModal {...props} />);
    fireEvent.change(screen.getByLabelText(/Class for Algebra 1/i), {
      target: { value: 'rA' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Link$/i }));
    await waitFor(() => expect(linkMock).toHaveBeenCalled());
    courseLinks = [
      { contextId: 'ctx-1', contextTitle: 'Algebra 1 · P1', rosterId: 'rA' },
    ];
    rerender(<LinkSchoologyModal {...props} />);
    await waitFor(() =>
      expect(screen.queryByLabelText(/Class for Algebra 1/i)).toBeNull()
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Unlink Algebra 1 · P1' })
    );
    expect(
      await screen.findByLabelText(/Class for Algebra 1/i)
    ).toBeInTheDocument();
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

  it('finds sections by class and links the checked ones', async () => {
    findMock.mockResolvedValue([
      {
        rosterId: 'rA',
        status: 'ready',
        contextId: '111',
        contextTitle: 'BIOLOGY A: (S1) P5',
        periodTitle: 'HS Semester 1 (26-27)',
        replacesTitle: '(S2) BIOLOGY B',
      },
      { rosterId: 'rB', status: 'none' },
    ]);
    linkFoundMock.mockResolvedValue([
      {
        rosterId: 'rA',
        status: 'linked',
        contextId: '111',
        contextTitle: 'BIOLOGY A: (S1) P5',
        replaced: ['(S2) BIOLOGY B'],
        replacedIds: ['999'],
      },
    ]);
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[
          roster('rA', 'Period 1', 'cl-A'),
          roster('rB', 'Period 2', 'cl-B'),
        ]}
        seenSections={[]}
        addToast={addToast}
        updateRoster={updateRoster}
        pasteLinkEnabled
        findCoursesEnabled
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Find my Schoology courses/i })
    );
    expect(
      await screen.findByText('BIOLOGY A: (S1) P5 · HS Semester 1 (26-27)')
    ).toBeInTheDocument();
    expect(screen.getByText('Replaces “(S2) BIOLOGY B”')).toBeInTheDocument();
    expect(screen.getByText('No Schoology course')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Period 1/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Period 2/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Link selected (1)' }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'Linked 1 class. Replaced “(S2) BIOLOGY B”.',
        'success'
      )
    );
    expect(linkFoundMock).toHaveBeenCalledWith({}, ['rA']);
    expect(updateRoster).toHaveBeenCalledWith('rA', { ltiContextId: '111' });
    expect(screen.getByText('Linked')).toBeInTheDocument();
  });

  it('leaves a move unchecked, names its class, and clears that mirror', async () => {
    findMock.mockResolvedValue([
      {
        rosterId: 'rB',
        status: 'ready',
        contextId: '111',
        contextTitle: 'BIOLOGY A: (S1) P5',
        movesFromRosterId: 'rA',
      },
    ]);
    linkFoundMock.mockResolvedValue([
      { rosterId: 'rB', status: 'linked', contextId: '111' },
    ]);
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[
          { ...roster('rA', 'Period 1', 'cl-A'), ltiContextId: '111' },
          roster('rB', 'Period 2', 'cl-B'),
        ]}
        seenSections={[]}
        addToast={addToast}
        updateRoster={updateRoster}
        pasteLinkEnabled
        findCoursesEnabled
      />
    );
    expect(screen.getByText(/sections? to link/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Find my Schoology courses/i })
    );
    expect(
      await screen.findByText('Moves the link from Period 1.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/sections? to link/)).toBeNull();
    const box = screen.getByRole('checkbox', { name: /Period 2/ });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: 'Link selected (1)' }));
    await waitFor(() =>
      expect(updateRoster).toHaveBeenCalledWith('rA', { ltiContextId: '' })
    );
    expect(updateRoster).toHaveBeenCalledWith('rB', { ltiContextId: '111' });
  });

  it('keeps a move checked when its class is relinked in the same pass', async () => {
    findMock.mockResolvedValue([
      {
        rosterId: 'rA',
        status: 'ready',
        contextId: '111',
        contextTitle: 'A section',
        replacesTitle: 'B section',
      },
      {
        rosterId: 'rB',
        status: 'ready',
        contextId: '222',
        contextTitle: 'B section',
        movesFromRosterId: 'rA',
      },
    ]);
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[
          { ...roster('rA', 'Period 1', 'cl-A'), ltiContextId: '222' },
          roster('rB', 'Period 2', 'cl-B'),
        ]}
        seenSections={[]}
        addToast={addToast}
        updateRoster={updateRoster}
        pasteLinkEnabled
        findCoursesEnabled
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Find my Schoology courses/i })
    );
    await screen.findByText('Moves the link from Period 1.');
    expect(document.getElementById('schoology-found-rA')).toBeChecked();
    expect(document.getElementById('schoology-found-rB')).toBeChecked();
  });

  it('hides Find without the flag', () => {
    render(
      <LinkSchoologyModal
        isOpen
        onClose={vi.fn()}
        rosters={[roster('rA', 'Period 1', 'cl-A')]}
        seenSections={[]}
        addToast={addToast}
        updateRoster={updateRoster}
        pasteLinkEnabled
      />
    );
    expect(
      screen.queryByRole('button', { name: /Find my Schoology courses/i })
    ).toBeNull();
  });
});
