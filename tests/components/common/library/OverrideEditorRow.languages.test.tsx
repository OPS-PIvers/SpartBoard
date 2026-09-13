// The per-student language select offers only the admin-curated languages,
// but never drops a code a student is already assigned (plan §5).

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthContext } from '@/context/AuthContextValue';
import { OverrideEditorRow } from '@/components/common/library/OverrideEditorRow';
import type { StudentOverride } from '@/types';

const { enabledCodes } = vi.hoisted(() => ({
  enabledCodes: { current: ['es', 'so', 'hmn'] as string[] },
}));

vi.mock('@/hooks/useQuizTranslationSettings', async () => {
  const { QUIZ_TRANSLATION_LANGUAGES } =
    await import('@/config/quizTranslation');
  return {
    useQuizTranslationSettings: () => ({
      settings: { enabledLanguages: enabledCodes.current },
      languages: QUIZ_TRANSLATION_LANGUAGES.filter((l) =>
        enabledCodes.current.includes(l.code)
      ),
    }),
  };
});

const renderRow = (override: StudentOverride = {}) =>
  render(
    <AuthContext.Provider
      value={
        {
          canAccessFeature: (f: string) => f === 'quiz-translation',
        } as never
      }
    >
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={override}
        onChange={vi.fn()}
        quizMode
        defaultExpanded
      />
    </AuthContext.Provider>
  );

const optionLabels = () =>
  screen.getAllByRole('option').map((o) => o.textContent);

describe('OverrideEditorRow language options', () => {
  it('offers every curated language the admin enabled', () => {
    enabledCodes.current = ['es', 'so', 'hmn'];
    renderRow();
    expect(optionLabels()).toEqual(
      expect.arrayContaining(['Español', 'Soomaali', 'Hmoob'])
    );
  });

  it('hides a language the admin disabled', () => {
    enabledCodes.current = ['es'];
    renderRow();
    const labels = optionLabels();
    expect(labels).toContain('Español');
    expect(labels).not.toContain('Soomaali');
    expect(labels).not.toContain('Hmoob');
  });

  it('still renders a student already assigned a now-disabled language', () => {
    enabledCodes.current = ['es'];
    renderRow({ language: 'so' });
    expect(optionLabels()).toContain('Soomaali');
    const select = screen.getByDisplayValue('Soomaali');
    expect((select as HTMLSelectElement).value).toBe('so');
    fireEvent.change(select, { target: { value: 'es' } });
  });
});
