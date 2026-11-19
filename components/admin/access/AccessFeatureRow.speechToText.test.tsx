import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { GlobalFeature, GlobalFeaturePermission } from '@/types';
import { AccessFeatureRow } from './AccessFeatureRow';
import { defaultDailyLimit } from './useGlobalPermissionsEditor';

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@test.com' } }),
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  onSnapshot: (
    path: string,
    next: (snap: { data: () => Record<string, unknown> }) => void
  ) => {
    next({
      data: () =>
        path.startsWith('ai_usage/global_speech_to_text_')
          ? { seconds: 720, tidyCalls: 41 }
          : {},
    });
    return () => undefined;
  },
}));

const renderRow = (
  featureId: GlobalFeature,
  config: GlobalFeaturePermission['config'] = {}
) => {
  const onUpdate = vi.fn();
  render(
    <AccessFeatureRow
      featureId={featureId}
      permission={{
        featureId,
        accessLevel: 'admin',
        betaUsers: [],
        enabled: true,
        buildings: [],
        config,
      }}
      isSaved
      isSaving={false}
      hasUnsaved={false}
      onUpdate={onUpdate}
      onSave={vi.fn()}
      showMessage={vi.fn()}
    />
  );
  fireEvent.click(
    document.querySelector(
      `[aria-controls="access-row-${featureId}"]`
    ) as Element
  );
  return onUpdate;
};

describe('AccessFeatureRow Speech to text extras', () => {
  it('defaults the daily limits to 300 phrases and 30 tidy-ups', () => {
    expect(defaultDailyLimit('speech-to-text-ai-transcription')).toBe(300);
    expect(defaultDailyLimit('speech-to-text-tidy-up')).toBe(30);
  });

  it('shows the per-student daily limit and the monthly minutes on the transcription row', () => {
    const onUpdate = renderRow('speech-to-text-ai-transcription');
    expect(screen.getByText('Limit 300/day')).toBeInTheDocument();
    expect(screen.getByText('phrases per student, per day.')).toBeTruthy();
    const cap = screen.getByLabelText<HTMLInputElement>(
      /monthly limit, minutes of speech/
    );
    expect(cap.value).toBe('1000');
    expect(
      screen.getByText(/12 of 1,000 minutes this month\./)
    ).toBeInTheDocument();
    fireEvent.change(cap, { target: { value: '250' } });
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: { monthlyCapSeconds: 15000 },
    });
  });

  it('saves the transcription mode on the row', () => {
    const onUpdate = renderRow('speech-to-text-ai-transcription', {
      dailyLimit: 300,
    });
    const select =
      screen.getByLabelText<HTMLSelectElement>('Transcription mode');
    expect(select.value).toBe('verbatim');
    fireEvent.change(select, { target: { value: 'smart' } });
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: { dailyLimit: 300, transcribeMode: 'smart' },
    });
  });

  it('shows tidy-up limits and no mode on the Tidy up row', () => {
    const onUpdate = renderRow('speech-to-text-tidy-up', {
      monthlyCapTidyCalls: 2000,
    });
    expect(screen.getByText('tidy-ups per student, per day.')).toBeTruthy();
    expect(screen.queryByLabelText('Transcription mode')).toBeNull();
    const cap = screen.getByLabelText<HTMLInputElement>(
      /monthly limit, tidy-ups/
    );
    expect(cap.value).toBe('2000');
    expect(
      screen.getByText(/41 of 2,000 tidy-ups this month\./)
    ).toBeInTheDocument();
    fireEvent.change(cap, { target: { value: '0' } });
    expect(onUpdate).toHaveBeenLastCalledWith({
      config: { monthlyCapTidyCalls: 0 },
    });
  });

  it('shows no monthly limit on other AI features', () => {
    renderRow('smart-poll');
    expect(screen.queryByText('Monthly limit')).toBeNull();
  });
});
