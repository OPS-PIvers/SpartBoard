/** DEV-only harness for WhiteboardResponseCapture at /whiteboard-capture-dev, with a mocked mic. */
import React, { useMemo, useState } from 'react';
import { WhiteboardResponseCapture } from '@/components/quiz/recording/WhiteboardResponseCapture';
import type { WhiteboardRecordingDeps } from '@/hooks/useWhiteboardRecording';
import type { RecordingConfig } from '@/types';

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

function makeDeps(denied: boolean): WhiteboardRecordingDeps {
  const track = { readyState: 'live', stop: () => undefined };
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  return {
    getStream: () =>
      denied
        ? Promise.reject(new DOMException('denied', 'NotAllowedError'))
        : Promise.resolve(stream),
    createRecorder: () => new MockRecorder() as unknown as MediaRecorder,
    isTypeSupported: () => true,
    now: () => performance.now(),
  };
}

export const WhiteboardCaptureDevView: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const [takes, setTakes] = useState(0);
  const config = useMemo<RecordingConfig>(
    () => ({
      mode: 'whiteboard',
      prepSeconds: Number(params.get('prep') ?? 0),
      limitSeconds: Number(params.get('limit') ?? 180),
      prepExpiry: 'armed',
      takeLimit: params.get('takes') ? Number(params.get('takes')) : null,
      explainAloud: params.get('drawOnly') !== '1',
      review: params.get('review') !== '0',
      startingPage: {
        pattern: {
          kind: 'coordinate-plane',
          xMin: -10,
          xMax: 10,
          yMin: -10,
          yMax: 10,
        },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fixed per page load
    []
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fixed per page load
  const deps = useMemo(() => makeDeps(params.get('denied') === '1'), []);

  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col">
        <WhiteboardResponseCapture
          config={config}
          takesCommitted={takes}
          noticeAckedAt={1_700_000_000_000}
          onAcknowledgeNotice={() => undefined}
          onCommit={async () => {
            await new Promise((r) => setTimeout(r, 600));
            setTakes((n) => n + 1);
          }}
          recorderDeps={deps}
        />
      </div>
    </div>
  );
};
