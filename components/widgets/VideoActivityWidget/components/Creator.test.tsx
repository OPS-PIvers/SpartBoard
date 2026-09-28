import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Creator } from './Creator';

vi.mock('@/utils/ai', () => ({
  generateVideoActivity: vi.fn(),
  recommendVideoForActivity: vi.fn(),
}));
vi.mock('@/components/common/library/importer', () => ({
  ImportWizard: () => null,
}));

const renderCreator = (aiEnabled: boolean) =>
  render(
    <Creator
      onBack={vi.fn()}
      onSave={vi.fn()}
      aiEnabled={aiEnabled}
      audioTranscriptionEnabled={false}
      createTemplateSheet={vi.fn()}
    />
  );

describe('Video Activity Creator AI gate', () => {
  it('offers the Recommend tab while AI is allowed', () => {
    renderCreator(true);
    expect(screen.getByRole('tab', { name: /Recommend/ })).toBeInTheDocument();
  });

  it('shows no Recommend tab while AI is off', () => {
    renderCreator(false);
    expect(screen.getByRole('tab', { name: /Paste URL/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Recommend/ })).toBeNull();
  });
});
