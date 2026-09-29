import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizBehaviorSettings, QuizData } from '@/types';

const { firestoreWrites } = vi.hoisted(() => ({
  firestoreWrites: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  isConfigured: false,
  isAuthBypass: false,
  app: {},
  db: {},
  auth: { currentUser: null },
  storage: {},
  functions: {},
  GOOGLE_OAUTH_SCOPES: [] as string[],
  googleProvider: {},
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    addDoc: firestoreWrites,
    setDoc: firestoreWrites,
    updateDoc: firestoreWrites,
    deleteDoc: firestoreWrites,
    runTransaction: firestoreWrites,
    writeBatch: firestoreWrites,
  };
});

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(true),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

import { QuizStudentView } from '@/components/quiz/QuizStudentView';

const QUIZ: QuizData = {
  id: 'quiz-1',
  title: 'Cells',
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Which organelle makes energy?',
      timeLimit: 0,
      correctAnswer: 'Mitochondria',
      incorrectAnswers: ['Nucleus', 'Ribosome'],
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} as QuizData;

const BEHAVIOR: QuizBehaviorSettings = {
  sessionMode: 'student',
  sessionOptions: { tabWarningsEnabled: true, blockCopyPaste: true },
  attemptLimit: 1,
};

const renderView = (onExit = vi.fn()) =>
  render(
    <QuizStudentView
      quiz={QUIZ}
      behavior={BEHAVIOR}
      tabAwayTimerOn
      onExit={onExit}
    />
  );

describe('QuizStudentView', () => {
  beforeEach(() => firestoreWrites.mockClear());
  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('shows the real student question with the quiz saved focus settings', () => {
    renderView();
    expect(
      screen.getByText('Which organelle makes energy?')
    ).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Focus mode' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(
      screen.getByRole('switch', { name: 'Block copy & paste' })
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Reset to quiz settings')).toBeNull();
  });

  it('offers a reset once a toolbar setting differs from the quiz', () => {
    renderView();
    fireEvent.click(screen.getByRole('switch', { name: 'Focus mode' }));
    expect(screen.queryByText('Auto-submit after')).toBeNull();
    fireEvent.click(screen.getByText('Reset to quiz settings'));
    expect(screen.getByText('Auto-submit after')).toBeInTheDocument();
    expect(screen.queryByText('Reset to quiz settings')).toBeNull();
  });

  it('steps the switch limit down to Off', () => {
    renderView();
    const fewer = screen.getByRole('button', { name: 'Fewer switches' });
    fireEvent.click(fewer);
    fireEvent.click(fewer);
    fireEvent.click(fewer);
    expect(screen.queryByText('switches')).toBeNull();
    expect(fewer).toBeDisabled();
  });

  it('shows the tab switch warning without writing anything', async () => {
    renderView();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByText('TAB SWITCH DETECTED')).toBeInTheDocument();
    expect(firestoreWrites).not.toHaveBeenCalled();
    hasFocus.mockRestore();
  });

  it('leaves no warning when focus mode is off', () => {
    renderView();
    fireEvent.click(screen.getByRole('switch', { name: 'Focus mode' }));
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.queryByText('TAB SWITCH DETECTED')).toBeNull();
    hasFocus.mockRestore();
  });

  it('exits back to the board', () => {
    const onExit = vi.fn();
    renderView(onExit);
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
