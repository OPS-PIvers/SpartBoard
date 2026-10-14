/**
 * DEV-only fixture wrapper for `AudioResponseCapture`. Mounts the REAL
 * component (no fork) in every state with a mocked MediaRecorder, because the
 * auth-bypass dev server cannot complete an anonymous student join.
 */
import React, { useMemo } from 'react';
import { AudioResponseCapture } from '@/components/quiz/recording/AudioResponseCapture';
import { SubmitBlockedNotice } from '@/components/quiz/recording/SubmitBlockedNotice';
import type { AudioRecordingDeps } from '@/hooks/useAudioRecording';
import { memoryTakeRecoveryStore } from '@/utils/takeRecoveryStore';
import type { RecordingConfig, ResponseArtifact } from '@/types';
import {
  AUDIO_CAPTURE_STATES,
  type AudioCaptureStateKey,
} from './devViewStates';

const ACKED_AT = 1_700_000_000_000;

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

function mockStream(): MediaStream {
  const track = { readyState: 'live', stop: () => undefined };
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function makeDeps(unavailable: boolean): AudioRecordingDeps {
  return {
    getStream: () =>
      unavailable
        ? Promise.reject(new DOMException('denied', 'NotAllowedError'))
        : Promise.resolve(mockStream()),
    createRecorder: () => new MockRecorder() as unknown as MediaRecorder,
    isTypeSupported: () => true,
    now: () => Date.now(),
  };
}

const SUBMIT_BLOCKED_QUESTIONS = [
  { id: 'q1', index: 0, text: 'Describe the water cycle in your own words.' },
  { id: 'q3', index: 2, text: 'Explain why the sky appears blue.' },
];

const pendingArtifact: ResponseArtifact = {
  id: 'artifact-dev',
  slot: 'primary',
  kind: 'audio',
  mimeType: 'audio/webm',
  bytes: 42_000,
  durationMs: 12_000,
  uploadState: 'pending',
};

const RECOVERED_KEY = 'dev-session/dev-response/dev-question';

/** An 18-second take left behind by a closed tab, captured 20 seconds ago. */
function seedRecoveredTake() {
  const store = memoryTakeRecoveryStore();
  const startedAt = Date.now() - 20_000;
  void store
    .begin(RECOVERED_KEY, 'audio/webm', startedAt)
    .then(() =>
      store.appendChunk(
        RECOVERED_KEY,
        new Blob(['fixture'], { type: 'audio/webm' }),
        startedAt + 18_000
      )
    );
  return { store, key: RECOVERED_KEY };
}

/**
 * Drives the component into a state by choosing config + props, then (for the
 * live states) firing the same buttons a student would.
 */
export const AudioCaptureDevView: React.FC<{ state: AudioCaptureStateKey }> = ({
  state: stateKey,
}) => {
  const light = !stateKey.startsWith('dark-');
  const state = (
    light ? stateKey : stateKey.slice('dark-'.length)
  ) as (typeof AUDIO_CAPTURE_STATES)[number];
  const config: RecordingConfig = useMemo(
    () => ({
      prepSeconds: state === 'prep' ? 30 : 0,
      limitSeconds: 60,
      prepExpiry: 'armed',
      takeLimit: state === 'take-limit' ? 2 : null,
    }),
    [state]
  );

  const deps = useMemo(() => makeDeps(state === 'mic-unavailable'), [state]);
  const recovery = useMemo(
    () => (state === 'recovered' ? seedRecoveredTake() : undefined),
    [state]
  );

  const rootRef = React.useRef<HTMLDivElement>(null);

  // Fixture-only: click the same buttons a student would to reach the state.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const click = (match: RegExp) => {
      const btn = Array.from(root.querySelectorAll('button')).find((b) =>
        match.test(b.textContent ?? '')
      );
      btn?.click();
      return !!btn;
    };
    if (state === 'recording' || state === 'mic-unavailable') {
      click(/^Record/);
      return;
    }
    if (state !== 'review' && state !== 'committing') return;
    click(/^Record/);
    // Poll for the Stop button: getUserMedia resolves on a later microtask.
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      if (click(/Stop recording/) || tries > 30) window.clearInterval(id);
    }, 10);
    return () => window.clearInterval(id);
  }, [state]);

  if (state === 'submit-blocked') {
    return (
      <div
        className={`h-full w-full overflow-auto p-6 ${
          light ? 'bg-slate-50' : 'bg-slate-900'
        }`}
      >
        <SubmitBlockedNotice
          light={light}
          questions={SUBMIT_BLOCKED_QUESTIONS}
          onJump={() => undefined}
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`h-full w-full overflow-auto p-6 ${
        light ? 'bg-slate-50' : 'bg-slate-900'
      }`}
    >
      <AudioResponseCapture
        key={stateKey}
        light={light}
        config={config}
        takesCommitted={state === 'take-limit' ? 2 : 0}
        noticeAckedAt={state === 'notice' ? null : ACKED_AT}
        onAcknowledgeNotice={() => undefined}
        onCommit={() =>
          state === 'archive-failed'
            ? Promise.reject(new Error('archive failed'))
            : new Promise<void>(() => undefined)
        }
        onRetryUpload={
          state === 'archive-failed'
            ? () => new Promise<void>(() => undefined)
            : undefined
        }
        latestArtifact={
          state === 'archive-failed' ? pendingArtifact : undefined
        }
        slotClosed={state === 'window-closed'}
        commitStateOverride={
          state === 'committing'
            ? 'committing'
            : state === 'archive-failed'
              ? 'archive-failed'
              : undefined
        }
        recorderDeps={deps}
        recovery={recovery}
      />
    </div>
  );
};
