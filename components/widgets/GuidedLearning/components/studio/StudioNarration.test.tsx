import React, { useEffect } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import type { AudioRecordingDeps } from '@/hooks/useAudioRecording';
import {
  useGuidedLearningEditorState,
  type GuidedLearningEditorController,
} from '../useGuidedLearningEditorState';
import { narrationSourceText, narrationTextHash } from '../../utils/narration';
import { StudioNarration, StudioNarrationBatch } from './StudioNarration';

const storage = vi.hoisted(() => ({
  uploading: false,
  uploadHotspotImage: vi.fn(),
  uploadGuidedLearningMedia: vi.fn(),
  uploadGuidedLearningImage: vi.fn(),
  deleteFile: vi.fn(),
  deleteDriveFile: vi.fn(),
}));
const generate = vi.hoisted(() => vi.fn());

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test-user' }, isAdmin: true }),
}));
vi.mock('@/hooks/useStorage', () => ({ useStorage: () => storage }));
vi.mock('../../utils/narration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/narration')>()),
  generateNarration: generate,
}));

class MockRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}
const clock = { now: 0 };
const track = { readyState: 'live', stop: () => undefined };
const recorderDeps: AudioRecordingDeps = {
  getStream: () =>
    Promise.resolve({
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream),
  createRecorder: () => new MockRecorder() as unknown as MediaRecorder,
  isTypeSupported: () => true,
  now: () => clock.now,
};

const RECORDED_OLD = {
  source: 'recorded' as const,
  url: 'https://example.com/old.webm',
  storagePath: 'users/test-user/hotspot_images/old-narration.webm',
  durationMs: 3000,
  textHash: 'stale-hash',
};

const step = (
  id: string,
  text: string,
  narration?: GuidedLearningStep['narration']
): GuidedLearningStep => ({
  id,
  xPct: 20,
  yPct: 20,
  imageIndex: 0,
  interactionType: 'tooltip',
  showOverlay: 'tooltip',
  text,
  ...(narration ? { narration } : {}),
});

const buildSet = (steps: GuidedLearningStep[]): GuidedLearningSet => ({
  id: 'set-1',
  schemaVersion: 3,
  title: 'Narrated',
  imageUrls: ['https://example.com/slide.png'],
  steps,
  mode: 'guided',
  createdAt: 1,
  updatedAt: 1,
});

const latest: { current: GuidedLearningEditorController | null } = {
  current: null,
};
const Harness: React.FC<{ set: GuidedLearningSet; batch?: boolean }> = ({
  set,
  batch,
}) => {
  const state = useGuidedLearningEditorState({
    existingSet: set,
    existingMeta: null,
  });
  useEffect(() => {
    latest.current = state;
  });
  const first = state.steps[0];
  return batch ? (
    <StudioNarrationBatch state={state} />
  ) : (
    <StudioNarration state={state} step={first} recorderDeps={recorderDeps} />
  );
};

const ctl = () => {
  if (!latest.current) throw new Error('not mounted');
  return latest.current;
};
const flushWith = async () => {
  const deleteFile = vi.fn().mockResolvedValue(undefined);
  await ctl().flushMediaDeletions(deleteFile, vi.fn());
  return deleteFile;
};

async function recordTake(durationMs: number) {
  fireEvent.click(screen.getByRole('button', { name: /Record/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
  await screen.findByRole('button', { name: /Stop/ });
  clock.now += durationMs;
  fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Use this recording' })
  );
  await waitFor(() =>
    expect(screen.queryByTestId('gl-narration-recorder')).toBeNull()
  );
}

let uploads = 0;
beforeEach(() => {
  vi.clearAllMocks();
  clock.now = 0;
  uploads = 0;
  storage.uploadGuidedLearningMedia.mockImplementation(() => {
    uploads++;
    return Promise.resolve({
      url: `https://example.com/take-${uploads}.webm`,
      storagePath: `users/test-user/hotspot_images/take-${uploads}.webm`,
    });
  });
});
afterEach(() => {
  cleanup();
  latest.current = null;
});

describe('Studio narration', () => {
  it('stores generated narration on the step', async () => {
    const text = 'Click Start.';
    generate.mockResolvedValue({
      source: 'generated',
      url: 'https://example.com/tts.mp3',
      storagePath: 'quiz_tts_cache/en-US-Neural2-F/abc.mp3',
      voice: 'en-US-Neural2-F',
      textHash: await narrationTextHash(text),
      durationMs: 2000,
    });
    render(<Harness set={buildSet([step('s1', text)])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate narration' }));
    await waitFor(() =>
      expect(ctl().steps[0].narration?.source).toBe('generated')
    );
    expect(generate).toHaveBeenCalledWith(text);
    expect(screen.getByText('Generated voice · 0:02')).toBeInTheDocument();
    expect(screen.queryByTestId('gl-narration-stale')).toBeNull();
  });

  it('flags generated narration whose text has changed', async () => {
    const narration = {
      source: 'generated' as const,
      url: 'https://example.com/tts.mp3',
      storagePath: 'quiz_tts_cache/v/abc.mp3',
      durationMs: 2000,
      textHash: await narrationTextHash('Old words.'),
    };
    render(<Harness set={buildSet([step('s1', 'New words.', narration)])} />);
    expect(await screen.findByTestId('gl-narration-stale')).toHaveTextContent(
      'Out of date'
    );
  });

  it('shows a text-changed note on a recorded take', async () => {
    render(<Harness set={buildSet([step('s1', 'Anything.', RECORDED_OLD)])} />);
    expect(await screen.findByTestId('gl-narration-stale')).toHaveTextContent(
      'Text changed since recording'
    );
  });

  it('records a take and stores it as recorded narration', async () => {
    render(<Harness set={buildSet([step('s1', 'Say this.')])} />);
    await recordTake(4000);
    const saved = ctl().steps[0].narration;
    expect(saved).toMatchObject({
      source: 'recorded',
      url: 'https://example.com/take-1.webm',
      storagePath: 'users/test-user/hotspot_images/take-1.webm',
      durationMs: 4000,
      textHash: await narrationTextHash(
        narrationSourceText({ text: 'Say this.' })
      ),
    });
    expect(storage.uploadGuidedLearningMedia).toHaveBeenCalledWith(
      'test-user',
      expect.any(Blob),
      'narration.webm'
    );
  });

  it('queues a take recorded this session when it is replaced', async () => {
    render(<Harness set={buildSet([step('s1', 'Say this.')])} />);
    await recordTake(1000);
    await recordTake(2000);
    expect(ctl().steps[0].narration?.storagePath).toBe(
      'users/test-user/hotspot_images/take-2.webm'
    );
    const deleteFile = await flushWith();
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith(
      'users/test-user/hotspot_images/take-1.webm'
    );
  });

  it('keeps a take from an earlier session, which copies may share', async () => {
    render(<Harness set={buildSet([step('s1', 'Say this.', RECORDED_OLD)])} />);
    await recordTake(1000);
    const deleteFile = await flushWith();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('never queues generated narration when it is removed', async () => {
    const narration = {
      source: 'generated' as const,
      url: 'https://example.com/tts.mp3',
      storagePath: 'quiz_tts_cache/v/abc.mp3',
      durationMs: 2000,
      textHash: 'x',
    };
    render(<Harness set={buildSet([step('s1', 'Text.', narration)])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(ctl().steps[0].narration).toBeUndefined();
    const deleteFile = await flushWith();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('undo of a replacement keeps the replaced take', async () => {
    render(<Harness set={buildSet([step('s1', 'Say this.')])} />);
    await recordTake(1000);
    await recordTake(2000);
    act(() => ctl().undo());
    expect(ctl().steps[0].narration?.storagePath).toBe(
      'users/test-user/hotspot_images/take-1.webm'
    );
    const deleteFile = await flushWith();
    expect(deleteFile).not.toHaveBeenCalled();
  });
});

describe('Generate all', () => {
  it('generates in order, skipping recorded takes, empty steps and current narration', async () => {
    const current = {
      source: 'generated' as const,
      url: 'https://example.com/c.mp3',
      storagePath: 'quiz_tts_cache/v/c.mp3',
      durationMs: 1000,
      textHash: await narrationTextHash('Current.'),
    };
    generate.mockImplementation((text: string) =>
      Promise.resolve({
        source: 'generated',
        url: `https://example.com/${text}.mp3`,
        storagePath: `quiz_tts_cache/v/${text}.mp3`,
        voice: 'v',
        textHash: 'h',
        durationMs: 1000,
      })
    );
    render(
      <Harness
        batch
        set={buildSet([
          step('a', 'First.'),
          step('b', 'Recorded.', RECORDED_OLD),
          step('c', ''),
          step('d', 'Current.', current),
          step('e', 'Last.'),
        ])}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate narration for all steps' })
    );
    await screen.findByText('Generated narration for 2 steps.');
    expect(generate.mock.calls.map((c) => c[0] as string)).toEqual([
      'First.',
      'Last.',
    ]);
    const byId = Object.fromEntries(ctl().steps.map((s) => [s.id, s]));
    expect(byId.a.narration?.source).toBe('generated');
    expect(byId.b.narration).toEqual(RECORDED_OLD);
    expect(byId.c.narration).toBeUndefined();
    expect(byId.d.narration).toEqual(current);
  });
});
