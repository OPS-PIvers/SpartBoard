import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourRecording } from '@/components/widgets/GuidedLearning/components/recorder/useTourCapture';
import { RecordFromHere } from './RecordFromHere';

const h = vi.hoisted(() => ({
  upload: vi.fn(),
  recording: null as TourRecording | null,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' }, canAccessFeature: () => false }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: () => Promise.resolve(true) }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploadGuidedLearningImage: h.upload }),
}));
vi.mock('@/utils/guidedLearningMedia', () => ({
  prepareImageForUpload: (file: File) => Promise.resolve(file),
}));
vi.mock(
  '@/components/widgets/GuidedLearning/components/recorder/recordingHandoff',
  async (orig) => ({
    ...(await orig<object>()),
    frameSize: () => Promise.resolve({ w: 100, h: 50 }),
  })
);
vi.mock(
  '@/components/widgets/GuidedLearning/components/recorder/TourRecorder',
  () => ({
    TourRecorder: (props: { onFinish: (r: TourRecording) => void }) => (
      <button
        type="button"
        onClick={() => h.recording && props.onFinish(h.recording)}
      >
        Finish
      </button>
    ),
  })
);

const frames = [new Blob(['one']), new Blob(['two'])];
const raw = [new Blob(['raw one']), new Blob(['raw two'])];

const recording = (blurred: boolean): TourRecording => ({
  frames,
  raw,
  redactions: [blurred ? [{ xPct: 10, yPct: 10, wPct: 20, hPct: 5 }] : [], []],
  steps: frames.map((_, i) => ({
    id: `s${i}`,
    xPct: 50,
    yPct: 50,
    region: { shape: 'rect', wPct: 10, hPct: 10 },
    tour: { anchor: 'sidebar.boards', action: 'click' },
    frameIndex: i,
    untagged: false,
  })),
});

const readText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });

const finish = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
};

beforeEach(() => {
  h.upload.mockReset();
  h.upload.mockImplementation((_uid: string, file: File) =>
    Promise.resolve({ url: `https://x/${file.name}` })
  );
});

describe('RecordFromHere', () => {
  it('adds the steps straight away when nothing was blurred', async () => {
    h.recording = recording(false);
    const onDone = vi.fn();
    render(<RecordFromHere slots={{}} onDone={onDone} onCancel={vi.fn()} />);
    await finish('Finish');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('stops for review when a frame was blurred, then uploads what was reviewed', async () => {
    h.recording = recording(true);
    const onDone = vi.fn();
    render(<RecordFromHere slots={{}} onDone={onDone} onCancel={vi.fn()} />);
    await finish('Finish');
    expect(
      screen.getByRole('dialog', { name: 'Review your recording' })
    ).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove all blur' }));
    await finish('Add steps');
    expect(onDone).toHaveBeenCalledTimes(1);
    const uploaded = h.upload.mock.calls.map((c) => c[1] as File);
    expect(uploaded).toHaveLength(2);
    expect(await readText(uploaded[0])).toBe('raw one');
    expect(await readText(uploaded[1])).toBe('two');
  });
});
