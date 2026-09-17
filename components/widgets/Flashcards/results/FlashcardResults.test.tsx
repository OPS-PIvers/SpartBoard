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
