import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Plc, PlcNote } from '@/types';
import { TEAM_HERO_BY_KIND, resolveTeamHeroEntry } from './heroRegistry';
import { TeamNoteHero } from './TeamNoteHero';

const notes = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/context/usePlcContext', () => ({
  usePlcNotesData: () => ({ data: notes.list }),
}));

const plc = { id: 'p1', name: 'Dept' } as unknown as Plc;
const note = {
  id: 'n1',
  title: 'Grading norms',
  body: 'Agreed rubric for unit 2',
  lastEditedAt: Date.UTC(2026, 9, 1),
  meetingAt: null,
  deletedAt: null,
} as unknown as PlcNote;

describe('note hero', () => {
  it('is registered for pinned notes', () => {
    expect(TEAM_HERO_BY_KIND.note).toBeDefined();
    expect(
      resolveTeamHeroEntry(
        { kind: 'note', noteId: 'n1' },
        'nextMeetingNote',
        'department'
      )
    ).toBe(TEAM_HERO_BY_KIND.note);
  });

  it('shows the pinned note with who pinned it', () => {
    notes.list = [note];
    render(
      <TeamNoteHero
        plc={plc}
        heroRef={{ kind: 'note', noteId: 'n1' }}
        pinnedBy={{ uid: 'u1', name: 'Priya Shah' }}
        isLead={false}
      />
    );
    expect(screen.getByRole('heading', { name: 'Grading norms' })).toBeTruthy();
    expect(screen.getByText(/Pinned by Priya Shah/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open note' })).toBeTruthy();
  });

  it('renders nothing when the pinned note is gone', () => {
    notes.list = [{ ...note, deletedAt: 5 }];
    const { container } = render(
      <TeamNoteHero plc={plc} heroRef={{ kind: 'note', noteId: 'n1' }} isLead />
    );
    expect(container.textContent).toBe('');
  });
});
