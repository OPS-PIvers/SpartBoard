import type {
  BrowserRecognition,
  RecognitionErrorEvent,
  RecognitionResultEvent,
} from './browserEngine';

type Phrase = readonly [text: string, isFinal: boolean];

/** Test double for the browser's SpeechRecognition. */
export class FakeRecognition implements BrowserRecognition {
  static instances: FakeRecognition[] = [];
  /** When false the fake has no `unspokenPunctuation` property, like older Chrome. */
  static punctuation = false;
  /** Makes the next `start()` throw. */
  static failStart = false;

  lang = '';
  continuous = false;
  interimResults = false;
  unspokenPunctuation?: boolean;
  onstart: (() => void) | null = null;
  onresult: ((event: RecognitionResultEvent) => void) | null = null;
  onerror: ((event: RecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  starts = 0;
  stops = 0;
  aborts = 0;
  private heard: Phrase[] = [];

  constructor() {
    if (FakeRecognition.punctuation) this.unspokenPunctuation = false;
    else delete this.unspokenPunctuation;
    FakeRecognition.instances.push(this);
  }

  static reset(): void {
    FakeRecognition.instances = [];
    FakeRecognition.punctuation = false;
    FakeRecognition.failStart = false;
  }

  /** The recognition object the engine is using now. */
  static get current(): FakeRecognition {
    const last = FakeRecognition.instances.at(-1);
    if (!last) throw new Error('no recognition created');
    return last;
  }

  start(): void {
    if (FakeRecognition.failStart) throw new Error('InvalidStateError');
    this.starts += 1;
    this.heard = [];
    this.onstart?.();
  }

  stop(): void {
    this.stops += 1;
    this.onend?.();
  }

  abort(): void {
    this.aborts += 1;
    this.onend?.();
  }

  /** Deliver a results list; `resultIndex` is the first changed row. */
  emit(phrases: readonly Phrase[], resultIndex = 0): void {
    const results = phrases.map(([transcript, isFinal]) => ({
      isFinal,
      length: 1,
      0: { transcript },
    }));
    this.onresult?.({
      resultIndex,
      results: { ...results, length: results.length },
    });
  }

  /** A finished phrase, added to this session's growing results list. */
  final(text: string): void {
    this.heard.push([text, true]);
    this.emit(this.heard, this.heard.length - 1);
  }

  error(error: string): void {
    this.onerror?.({ error });
  }

  /** The browser ends the session on its own. */
  end(): void {
    this.onend?.();
  }
}

/** Put the fake on `window`; returns a function that removes it. */
export function installFakeRecognition(): () => void {
  FakeRecognition.reset();
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    writable: true,
    value: FakeRecognition,
  });
  return () => {
    Reflect.deleteProperty(window, 'webkitSpeechRecognition');
    FakeRecognition.reset();
  };
}
