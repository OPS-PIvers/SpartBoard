import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FlashcardSession } from '@/types';
import type { FlashcardResultRecord } from '@/utils/flashcardResults';
import { FlashcardStudyResults } from './FlashcardStudyResults';
import { FlashcardCheckReview } from './FlashcardCheckReview';

const CARDS = [
  { id: 'c1', term: 'el perro', definition: 'dog' },
  { id: 'c2', term: 'la canción', definition: 'song' },
];

const session = (over: Partial<FlashcardSession> = {}): FlashcardSession => ({
  id: 'a1',
  teacherUid: 'teacher-1',
  setId: 'set-1',
  title: 'Spanish',
  kind: 'study',
  termLanguage: 'es-ES',
  definitionLanguage: 'en-US',
  cards: CARDS,
  classIds: ['class-1'],
  status: 'active',
  createdAt: 1,
  ...over,
});

const nameFor = (uid: string): string =>
  uid === 'a' ? 'Ada Lovelace' : 'Blaise Pascal';

describe('FlashcardStudyResults', () => {
  const results: FlashcardResultRecord[] = [
    {
      studentUid: 'a',
      classId: 'class-1',
      studyMs: 900000,
      lastActiveAt: 1,
      modesUsed: ['write'],
      tests: [{ at: 5, count: 2, score: 1 }],
      cards: {
        c1: { s: 3, due: 1, c: 3, w: 0 },
        c2: { s: 0, due: 1, c: 0, w: 2 },
      },
    },
    { studentUid: 'b', classId: 'class-1', studyMs: 0, cards: {} },
  ];

  it('shows the aggregate strip and a per-student row', () => {
    render(
      <FlashcardStudyResults
        session={session()}
        results={results}
        tests={{ a: [{ at: 5, count: 2, score: 1 }] }}
        nameFor={nameFor}
        onResetStudent={vi.fn()}
        now={Date.now()}
      />
    );
    expect(screen.getByText('Average mastered')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText(/1\/2 mastered/)).toBeTruthy();
  });

  it('lists the hardest cards by misses', () => {
    render(
      <FlashcardStudyResults
        session={session()}
        results={results}
        tests={{}}
        nameFor={nameFor}
        onResetStudent={vi.fn()}
        now={Date.now()}
      />
    );
    expect(screen.getByText('Hardest cards (1)')).toBeTruthy();
    expect(screen.getByText('2 misses')).toBeTruthy();
  });

  it('opens a student drawer with test history and resets them', () => {
    const onResetStudent = vi.fn();
    render(
      <FlashcardStudyResults
        session={session()}
        results={results}
        tests={{ a: [{ at: 5, count: 2, score: 1 }] }}
        nameFor={nameFor}
        onResetStudent={onResetStudent}
        now={Date.now()}
      />
    );
    fireEvent.click(screen.getByText('Ada Lovelace'));
    expect(screen.getByText(/Practice tests/)).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset this student' }));
    expect(onResetStudent).toHaveBeenCalledWith('a');
  });
});

describe('FlashcardStudyResults Speaking view', () => {
  const ref = { dialect: 'es-ES' as const, tokens: ['p'], stress: [] };
  const SPEAK_CARDS = ['perro', 'casa'].map((term, i) => ({
    id: `s${i + 1}`,
    term,
    definition: term === 'perro' ? 'dog' : 'house',
    speak: { term, refs: [ref], g2pVersion: 'v1', status: 'ready' as const },
  }));
  const sp = (s: number, c = 0, w = 0) =>
    ({ s, due: 1, c, w, best: 0, last: 0, tries: 1 }) as never;
  const ran: FlashcardResultRecord = {
    studentUid: 'a',
    speak: { s1: sp(3, 3, 0), s2: sp(0, 0, 2) },
    speakSounds: { r: { n: 4, m: 3, f: 1 } },
  };
  const neverRan: FlashcardResultRecord = { studentUid: 'b', cards: {} };
  const showSpeaking = (results: FlashcardResultRecord[]) => {
    render(
      <FlashcardStudyResults
        session={session({ cards: SPEAK_CARDS })}
        results={results}
        tests={{}}
        nameFor={nameFor}
        onResetStudent={vi.fn()}
        now={Date.now()}
        speakLanguage="es"
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Speaking' }));
  };

  it('has no switch without a Speak language', () => {
    render(
      <FlashcardStudyResults
        session={session()}
        results={[]}
        tests={{}}
        nameFor={nameFor}
        onResetStudent={vi.fn()}
        now={Date.now()}
      />
    );
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('shows per-student words and sounds, and a dash for never-ran', () => {
    showSpeaking([ran, neverRan]);
    expect(
      screen.getByText('Said well 1 · In progress 1 · Not started 0')
    ).toBeTruthy();
    expect(screen.getByText('Rolled r')).toBeTruthy();
    expect(screen.getByText('Sounds to practice:')).toBeTruthy();
    const rows = screen.getAllByTestId('session-row');
    const blaise = rows.find((row) => row.textContent?.includes('Blaise'));
    expect(blaise?.textContent).toContain('—');
    expect(blaise?.textContent).not.toContain('Said well');
    expect(screen.getAllByText('Rolled r, as in perro')).toHaveLength(2);
    expect(screen.getByText('3/4')).toBeTruthy();
    expect(screen.getByText('Sounds let go most (1)')).toBeTruthy();
    expect(screen.queryByText(/Words to check/)).toBeNull();
  });

  it('says no one has practiced aloud when nobody ran Speak', () => {
    showSpeaking([neverRan]);
    expect(screen.getByText('No one has practiced aloud yet.')).toBeTruthy();
    expect(screen.queryByText(/Sounds let go most/)).toBeNull();
  });

  it('lists words to check once five students mostly failed', () => {
    const failing = Array.from({ length: 5 }, (_, i) => ({
      studentUid: `f${i}`,
      speak: { s2: sp(0, 0, 2) },
    }));
    showSpeaking(failing);
    expect(screen.getByText('Words to check (1)')).toBeTruthy();
    expect(screen.getByText('5/5')).toBeTruthy();
    expect(screen.getByText('house')).toBeTruthy();
  });
});

describe('FlashcardCheckReview', () => {
  const checkSession = session({ kind: 'check', checkMode: 'write' });
  const results: FlashcardResultRecord[] = [
    {
      studentUid: 'a',
      classId: 'class-1',
      submittedAt: 10,
      score: 1,
      total: 2,
      answerLog: [
        { cardId: 'c1', response: 'dog', correct: true },
        { cardId: 'c2', response: 'tune', correct: false },
      ],
      flags: [{ cardId: 'c2', response: 'tune' }],
    },
    { studentUid: 'b', classId: 'class-1' },
  ];

  it('separates submitted students from in-progress ones', () => {
    render(
      <FlashcardCheckReview
        session={checkSession}
        results={results}
        nameFor={nameFor}
        onResetStudent={vi.fn()}
        onResolveFlag={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByText(/1\/2 · submitted/)).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('Flags to review')).toBeTruthy();
  });

  it('accepts a flagged answer', () => {
    const onResolveFlag = vi.fn().mockResolvedValue(undefined);
    render(
      <FlashcardCheckReview
        session={checkSession}
        results={results}
        nameFor={nameFor}
        onResetStudent={vi.fn()}
        onResolveFlag={onResolveFlag}
      />
    );
    expect(screen.getByText(/Wrote “tune” · expected “song”/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onResolveFlag).toHaveBeenCalledWith('a', 'c2', true);
  });

  it('resets a student from the row menu', () => {
    const onResetStudent = vi.fn();
    render(
      <FlashcardCheckReview
        session={checkSession}
        results={[results[0]]}
        nameFor={nameFor}
        onResetStudent={onResetStudent}
        onResolveFlag={vi.fn().mockResolvedValue(undefined)}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Actions for Ada Lovelace' })
    );
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Reset this student' })
    );
    expect(onResetStudent).toHaveBeenCalledWith('a');
  });
});
