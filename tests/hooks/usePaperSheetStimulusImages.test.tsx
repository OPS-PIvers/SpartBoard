/**
 * usePaperSheetStimulusImages — what makes it go back to Drive, and what does
 * not (docs/plans/QUIZ_PAPER_SHEET_STIMULI.md D16).
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PaperSheetStimulus } from '@/types';

const getDriveFileAsBlob = vi.fn(() =>
  Promise.resolve({ blob: new Blob(['x']) })
);
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ getDriveFileAsBlob }),
}));

import { usePaperSheetStimulusImages } from '@/hooks/usePaperSheetStimulusImages';

const stim = (over: Partial<PaperSheetStimulus> = {}): PaperSheetStimulus => ({
  id: 'a',
  label: 'Graph',
  source: 'image',
  driveFileId: 'drive-a',
  ...over,
});

const Probe: React.FC<{ stimuli: PaperSheetStimulus[] }> = ({ stimuli }) => {
  const { src } = usePaperSheetStimulusImages(stimuli);
  return <div data-testid="count">{Object.keys(src).length}</div>;
};

beforeEach(() => {
  getDriveFileAsBlob.mockClear();
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:stub'),
    revokeObjectURL: vi.fn(),
  });
});

describe('usePaperSheetStimulusImages', () => {
  const one = stim({ id: 'a', driveFileId: 'f1' });
  const two = stim({ id: 'b', driveFileId: 'f2' });

  it('fetches each image once', async () => {
    const { findByText } = render(<Probe stimuli={[one, two]} />);
    await findByText('2');
    expect(getDriveFileAsBlob).toHaveBeenCalledTimes(2);
  });

  it('does not re-fetch when the teacher only reorders the stack', async () => {
    const { rerender, findByText } = render(<Probe stimuli={[one, two]} />);
    await findByText('2');
    getDriveFileAsBlob.mockClear();
    rerender(<Probe stimuli={[two, one]} />);
    await waitFor(() => expect(getDriveFileAsBlob).not.toHaveBeenCalled());
  });

  it('does not re-fetch when the teacher only edits a caption', async () => {
    const { rerender, findByText } = render(<Probe stimuli={[one]} />);
    await findByText('1');
    getDriveFileAsBlob.mockClear();
    rerender(<Probe stimuli={[{ ...one, caption: 'Use for 1-10' }]} />);
    await waitFor(() => expect(getDriveFileAsBlob).not.toHaveBeenCalled());
  });

  it('fetches again when a new image joins the stack', async () => {
    const { rerender, findByText } = render(<Probe stimuli={[one]} />);
    await findByText('1');
    getDriveFileAsBlob.mockClear();
    rerender(<Probe stimuli={[one, two]} />);
    await findByText('2');
    expect(getDriveFileAsBlob).toHaveBeenCalled();
  });
});
