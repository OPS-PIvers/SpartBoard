import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WritingRecordView } from './WritingRecord';

const summary = {
  wordCount: 80,
  savedAt: 1,
  writingMs: 120_000,
  sessions: 1,
  pasteCount: 0,
  pastedChars: 0,
  untypedCount: 0,
  untypedChars: 0,
  awayMs: 0,
  awayCount: 0,
};

const chunks = [{ index: 0, log: 'T1;0:I ;D5,,,said this aloud;a:.' }];

describe('WritingRecordView dictation (Speech to text)', () => {
  it('states how much was dictated and lists each passage', () => {
    render(
      <WritingRecordView
        chunks={chunks}
        facts={{
          summary: { ...summary, dictatedCount: 3, dictatedChars: 412 },
        }}
      />
    );
    expect(screen.getByText('3 passages, 412 characters')).toBeInTheDocument();
    expect(screen.getAllByText('Dictated').length).toBeGreaterThan(0);
    expect(screen.getByText('said this aloud')).toBeInTheDocument();
    // Pastes and untyped additions stay at none: dictated text is neither.
    expect(screen.getAllByText('None')).toHaveLength(3);
  });

  it('shows no Dictated row for a student who never dictated', () => {
    render(
      <WritingRecordView
        chunks={[{ index: 0, log: 'T1;0:I typed' }]}
        facts={{ summary }}
      />
    );
    expect(screen.queryByText('Dictated')).not.toBeInTheDocument();
  });
});
