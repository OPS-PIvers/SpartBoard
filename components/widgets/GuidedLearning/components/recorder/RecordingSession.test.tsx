import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import type { GuidedLearningSet } from '@/types';
import { RecordingSession } from './RecordingSession';
import type { NameMatcher } from './redaction';
import type { TourRecording } from './useTourCapture';

const h = vi.hoisted(() => ({
  upload: vi.fn(),
  save: vi.fn(),
  draft: vi.fn(),
  matcher: null as NameMatcher | null,
  recording: null as TourRecording | null,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' } }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: () => Promise.resolve(true) }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploadGuidedLearningImage: h.upload }),
}));
vi.mock('@/hooks/useGuidedLearning', () => ({
  useGuidedLearning: () => ({ saveBuildingSet: h.save }),
}));
vi.mock('@/utils/guidedLearningMedia', () => ({
  prepareImageForUpload: (file: File) => Promise.resolve(file),
}));
vi.mock('./draftStepText', () => ({ draftRecordedStepText: h.draft }));
vi.mock('./TourRecorder', () => ({
  TourRecorder: (props: {
    matcher: NameMatcher | null;
    onFinish: (r: TourRecording) => void;
  }) => {
    h.matcher = props.matcher;
    return (
      <button
        type="button"
        onClick={() => h.recording && props.onFinish(h.recording)}
      >
        Stub finish
      </button>
    );
  },
}));
vi.mock('../studio/GuidedLearningStudio', () => ({
  GuidedLearningStudio: (props: {
    set: GuidedLearningSet;
    aiDrafts?: ReadonlyMap<string, unknown>;
  }) => (
    <div data-testid="studio">
      {props.set.title} · {props.aiDrafts?.size ?? 0} drafted
    </div>
  ),
}));

const frames = [new Blob(['blurred one']), new Blob(['blurred two'])];

const dashboard = {
  rosters: [
    {
      id: 'r1',
      name: 'Period 1',
      students: [
        { id: 's1', firstName: 'Alice', lastName: 'Nguyen', pin: '01' },
      ],
    },
    { id: 'r2', name: 'Period 2', students: [], loadError: 'Drive failed' },
  ],
  activeDashboard: { widgets: [{ type: 'clock' }, { type: 'timer' }] },
} as unknown as DashboardContextValue;

const readText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(blob);
  });

const renderSession = (onEnd = vi.fn()) => {
  render(
    <DashboardContext.Provider value={dashboard}>
      <RecordingSession onEnd={onEnd} />
    </DashboardContext.Provider>
  );
  return onEnd;
};

beforeEach(() => {
  h.upload.mockReset();
  h.upload.mockImplementation((_uid: string, file: File) =>
    Promise.resolve({
      url: `https://storage.example/${file.name}`,
      storagePath: `users/admin-1/hotspot_images/${file.name}`,
      thumbnailUrl: `https://storage.example/thumbs/${file.name}`,
    })
  );
  h.save.mockReset();
  h.save.mockResolvedValue(undefined);
  h.draft.mockReset();
  h.draft.mockResolvedValue([
    { label: 'Clock widget', text: 'Click the clock to add it.' },
    { label: '', text: '' },
  ]);
  h.matcher = null;
  h.recording = {
    frames,
    redactions: [[], []],
    steps: frames.map((_, i) => ({
      id: `step-${i}`,
      xPct: 50,
      yPct: 50,
      region: { shape: 'rect', wPct: 10, hPct: 10 },
      tour: { anchor: 'sidebar.boards', action: 'click' },
      frameIndex: i,
      untagged: false,
    })),
  };
});

describe('RecordingSession', () => {
  it('says what is blurred, and which class lists could not be read, before recording', () => {
    renderSession();
    expect(
      screen.getByRole('dialog', { name: 'Record a live tour' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "1 class list didn't load, so its names can't be blurred automatically."
      )
    ).toBeInTheDocument();
  });

  it('records with the roster names, then uploads only the reviewed frames and opens the Studio', async () => {
    renderSession();
    fireEvent.change(screen.getByLabelText('What does this tour show?'), {
      target: { value: 'Add a clock' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(h.matcher?.test('alice nguyen')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Stub finish' }));
    expect(h.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Upload and open in Studio' })
      );
      await Promise.resolve();
    });

    const uploaded = await Promise.all(
      h.upload.mock.calls.map((call) => readText(call[1] as File))
    );
    expect(uploaded).toEqual(['blurred one', 'blurred two']);
    for (const call of h.upload.mock.calls) expect(call[3]).toBe('storage');
    expect(h.draft).toHaveBeenCalledWith(
      expect.objectContaining({ frames }),
      'Add a clock'
    );
    const saved = h.save.mock.calls[0][0] as GuidedLearningSet;
    expect(saved).toMatchObject({
      title: 'Add a clock',
      isBuilding: true,
      hasLiveTour: true,
      imageUrls: [
        'https://storage.example/tour-step-1.png',
        'https://storage.example/tour-step-2.png',
      ],
      imagePaths: [
        'users/admin-1/hotspot_images/tour-step-1.png',
        'users/admin-1/hotspot_images/tour-step-2.png',
      ],
      slideThumbnails: {
        'https://storage.example/tour-step-1.png':
          'https://storage.example/thumbs/tour-step-1.png',
        'https://storage.example/tour-step-2.png':
          'https://storage.example/thumbs/tour-step-2.png',
      },
      tourSetup: { widgets: ['clock', 'timer'] },
    });
    expect(saved.steps[0]).toMatchObject({
      label: 'Clock widget',
      text: 'Click the clock to add it.',
    });
    expect(saved.steps[1].label).toBe('');
    expect(await screen.findByTestId('studio')).toHaveTextContent(
      'Add a clock · 1 drafted'
    );
  });

  it('still opens the Studio when drafting the text fails', async () => {
    h.draft.mockRejectedValue(new Error('quota'));
    renderSession();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stub finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Upload and open in Studio' })
      );
      await Promise.resolve();
    });
    expect(await screen.findByTestId('studio')).toHaveTextContent(
      'Untitled tour · 0 drafted'
    );
  });
});
