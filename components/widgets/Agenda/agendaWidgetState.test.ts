import { describe, expect, it } from 'vitest';
import type { Course } from '@/utils/course/contract';
import {
  DECK_CHECK_MIN_GAP_MS,
  agendaChoices,
  agendaEmbedUrl,
  agendaOpenUrl,
  deckBlocksStudents,
  pickPatch,
  resolveAgendaChoice,
  shouldCheckDeck,
} from './agendaWidgetState';

const FILE = '1AbCdEfGhIjKlMnOp';

const course = (over: Partial<Course> = {}): Course => ({
  id: 'c1',
  name: 'English 9',
  teacherName: 'T',
  rosterIds: ['r1', 'r2'],
  agenda: { fileId: FILE, title: 'Daily' },
  pinnedLinks: [],
  familyLink: null,
  linkId: 'l1',
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const ROSTERS = [
  { id: 'r1', name: 'English 9 P1' },
  { id: 'r2', name: 'English 9 P2' },
  { id: 'r3', name: 'History P6' },
];

describe('agendaChoices', () => {
  it('lists a Course once and each class in no Course on its own', () => {
    const choices = agendaChoices([course()], ROSTERS);
    expect(choices.map((c) => [c.key, c.label, c.rosters.length])).toEqual([
      ['course:c1', 'English 9', 2],
      ['roster:r3', 'History P6', 1],
    ]);
  });
});

describe('resolveAgendaChoice', () => {
  it('finds the picked Course by id', () => {
    const choices = agendaChoices([course()], ROSTERS);
    expect(resolveAgendaChoice({ courseId: 'c1' }, choices)?.key).toBe(
      'course:c1'
    );
  });

  it('follows the picked class into the Course that now holds it', () => {
    const merged = course({ id: 'c2', rosterIds: ['r1', 'r2', 'r3'] });
    const choices = agendaChoices([merged], ROSTERS);
    expect(
      resolveAgendaChoice({ courseId: 'gone', rosterId: 'r3' }, choices)?.key
    ).toBe('course:c2');
  });

  it('is null when neither the Course nor the class is left', () => {
    const choices = agendaChoices([], ROSTERS);
    expect(
      resolveAgendaChoice({ courseId: 'gone', rosterId: 'gone' }, choices)
    ).toBeNull();
    expect(resolveAgendaChoice({}, choices)).toBeNull();
  });

  it('round-trips a pick of a class in no Course', () => {
    const choices = agendaChoices([], ROSTERS);
    const patch = pickPatch(choices[2]);
    expect(patch).toEqual({ courseId: undefined, rosterId: 'r3' });
    expect(resolveAgendaChoice(patch, choices)?.key).toBe('roster:r3');
  });
});

describe('deck URLs', () => {
  it('embeds the first slide without the toolbar', () => {
    expect(agendaEmbedUrl(FILE)).toBe(
      `https://docs.google.com/presentation/d/${FILE}/embed?start=false&loop=false&rm=minimal`
    );
    expect(agendaOpenUrl(FILE)).toBe(
      `https://docs.google.com/presentation/d/${FILE}/edit`
    );
  });

  it('refuses an id that is not a Drive file id', () => {
    expect(agendaEmbedUrl('../../evil?x=1')).toBeNull();
    expect(agendaOpenUrl('short')).toBeNull();
  });
});

describe('shouldCheckDeck', () => {
  const now = 10 * DECK_CHECK_MIN_GAP_MS;
  const checked = (at: number) =>
    course({
      deckCheck: { checkedAt: at, modifiedAt: null, sharing: 'domain' },
    });

  it('checks a deck never checked, or checked a while ago', () => {
    expect(shouldCheckDeck(course(), now)).toBe(true);
    expect(shouldCheckDeck(checked(now - DECK_CHECK_MIN_GAP_MS), now)).toBe(
      true
    );
  });

  it('skips a deck checked moments ago, a Course with no Agenda and no Course', () => {
    expect(shouldCheckDeck(checked(now - 1000), now)).toBe(false);
    expect(shouldCheckDeck(course({ agenda: null }), now)).toBe(false);
    expect(shouldCheckDeck(null, now)).toBe(false);
  });
});

describe('deckBlocksStudents', () => {
  it('is true only for a deck last read as private', () => {
    const at = (sharing: 'private' | 'domain' | 'anyone' | 'unknown') =>
      course({ deckCheck: { checkedAt: 1, modifiedAt: null, sharing } });
    expect(deckBlocksStudents(at('private'))).toBe(true);
    expect(deckBlocksStudents(at('domain'))).toBe(false);
    expect(deckBlocksStudents(at('anyone'))).toBe(false);
    expect(deckBlocksStudents(at('unknown'))).toBe(false);
    expect(deckBlocksStudents(course())).toBe(false);
  });
});
