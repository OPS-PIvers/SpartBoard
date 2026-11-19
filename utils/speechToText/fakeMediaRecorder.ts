/** Test double for MediaRecorder and the microphone stream it records. */
export class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  /** What each stopped recording hands back. */
  static audio = 'spoken words';

  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    readonly stream: unknown,
    options?: { mimeType?: string }
  ) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
    FakeMediaRecorder.instances.push(this);
  }

  static isTypeSupported(type: string): boolean {
    return type.startsWith('audio/webm');
  }

  static reset(): void {
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.audio = 'spoken words';
  }

  /** Recorders still recording. */
  static get live(): FakeMediaRecorder[] {
    return FakeMediaRecorder.instances.filter((r) => r.state === 'recording');
  }

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({
      data: new Blob([FakeMediaRecorder.audio], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}

export interface FakeMicrophone {
  getUserMedia: () => Promise<unknown>;
  /** Tracks handed out so far; `stopped` flips when the engine lets the mic go. */
  tracks: { stopped: boolean }[];
  /** Makes the next request for the microphone fail. */
  deny: boolean;
  calls: number;
}

/** Put the fake recorder and microphone on the page; returns the mic and a function that removes both. */
export function installFakeMediaRecorder(
  options: { recorder?: boolean } = {}
): {
  mic: FakeMicrophone;
  uninstall: () => void;
} {
  FakeMediaRecorder.reset();
  const mic: FakeMicrophone = {
    tracks: [],
    deny: false,
    calls: 0,
    getUserMedia: () => {
      mic.calls += 1;
      if (mic.deny) return Promise.reject(new Error('NotAllowedError'));
      const track = {
        stopped: false,
        stop() {
          track.stopped = true;
        },
      };
      mic.tracks.push(track);
      return Promise.resolve({ getTracks: () => [track] });
    },
  };
  if (options.recorder !== false) {
    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      writable: true,
      value: FakeMediaRecorder,
    });
  }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    writable: true,
    value: { getUserMedia: mic.getUserMedia },
  });
  return {
    mic,
    uninstall: () => {
      Reflect.deleteProperty(globalThis, 'MediaRecorder');
      Reflect.deleteProperty(navigator, 'mediaDevices');
      FakeMediaRecorder.reset();
    },
  };
}
