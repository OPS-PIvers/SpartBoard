import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_QUICK_ENDS,
  QUICK_END_MS,
  QUICK_RESTART_DELAY_MS,
  createBrowserEngine,
  isBrowserEngineSupported,
  mapRecognitionError,
  type BrowserSpeechEngine,
} from './browserEngine';
import { FakeRecognition, installFakeRecognition } from './fakeRecognition';

const callbacks = () => ({
  onStart: vi.fn(),
  onInterim: vi.fn(),
  onFinal: vi.fn(),
  onError: vi.fn(),
  onEnd: vi.fn(),
});

const engineOrThrow = (): BrowserSpeechEngine => {
  const engine = createBrowserEngine();
  if (!engine) throw new Error('engine unsupported');
  return engine;
};

describe('browser engine without recognition', () => {
  it('reports unsupported and creates no engine', () => {
    expect(isBrowserEngineSupported()).toBe(false);
    expect(createBrowserEngine()).toBeNull();
  });
});

describe('browser engine', () => {
  let uninstall: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    uninstall = installFakeRecognition();
  });

  afterEach(() => {
    uninstall();
    vi.useRealTimers();
  });

  it('detects support and configures the recognition', () => {
    expect(isBrowserEngineSupported()).toBe(true);
    const engine = engineOrThrow();
    const cb = callbacks();
    engine.start({ locale: 'es-US' }, cb);
    const rec = FakeRecognition.current;
    expect(rec.lang).toBe('es-US');
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(rec.starts).toBe(1);
    expect(cb.onStart).toHaveBeenCalledTimes(1);
    expect(engine.punctuates).toBe(false);
    expect('unspokenPunctuation' in rec).toBe(false);
  });

  it('turns on unspoken punctuation where the browser has it', () => {
    FakeRecognition.punctuation = true;
    const engine = engineOrThrow();
    expect(engine.punctuates).toBe(true);
    engine.start({ locale: 'en-US' }, callbacks());
    expect(FakeRecognition.current.unspokenPunctuation).toBe(true);
  });

  it('reports interim words, then each final phrase once', () => {
    const engine = engineOrThrow();
    const cb = callbacks();
    engine.start({ locale: 'en-US' }, cb);
    const rec = FakeRecognition.current;
    rec.emit([['hello wor', false]]);
    expect(cb.onInterim).toHaveBeenLastCalledWith('hello wor');
    rec.emit([[' hello world ', true]]);
    expect(cb.onFinal).toHaveBeenCalledWith('hello world');
    expect(cb.onInterim).toHaveBeenLastCalledWith('');
    rec.emit(
      [
        ['hello world', true],
        ['next', false],
      ],
      0
    );
    expect(cb.onFinal).toHaveBeenCalledTimes(1);
    expect(cb.onInterim).toHaveBeenLastCalledWith('next');
    rec.emit(
      [
        ['hello world', true],
        ['next phrase', true],
      ],
      1
    );
    expect(cb.onFinal).toHaveBeenLastCalledWith('next phrase');
    expect(cb.onFinal).toHaveBeenCalledTimes(2);
  });

  it('restarts when the browser ends the session on its own', () => {
    const engine = engineOrThrow();
    const cb = callbacks();
    engine.start({ locale: 'en-US' }, cb);
    const rec = FakeRecognition.current;
    vi.advanceTimersByTime(QUICK_END_MS + 5_000);
    rec.end();
    expect(rec.starts).toBe(2);
    expect(cb.onEnd).not.toHaveBeenCalled();
    rec.emit([['again', true]]);
    expect(cb.onFinal).toHaveBeenCalledWith('again');
  });

  it('keeps words the browser never marked final when it ends', () => {
    const engine = engineOrThrow();
    const cb = callbacks();
    engine.start({ locale: 'en-US' }, cb);
    const rec = FakeRecognition.current;
    rec.emit([['half a thought', false]]);
    vi.advanceTimersByTime(QUICK_END_MS * 2);
    rec.end();
    expect(cb.onFinal).toHaveBeenCalledWith('half a thought');
    expect(rec.starts).toBe(2);
  });

  it('gives up after repeated quick ends', () => {
    const engine = engineOrThrow();
    const cb = callbacks();
    engine.start({ locale: 'en-US' }, cb);
    const rec = FakeRecognition.current;
    for (let i = 1; i < MAX_QUICK_ENDS; i++) {
      rec.end();
      expect(rec.starts).toBe(i);
      vi.advanceTimersByTime(QUICK_RESTART_DELAY_MS);
      expect(rec.starts).toBe(i + 1);
    }
    rec.end();
    vi.advanceTimersByTime(QUICK_RESTART_DELAY_MS * 10);
    expect(rec.starts).toBe(MAX_QUICK_ENDS);
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
  });

  it('a long session clears the quick-end count', () => {
    const engine = engineOrThrow();
    const cb = callbacks();
    engine.start({ locale: 'en-US' }, cb);
    const rec = FakeRecognition.current;
    for (let round = 0; round < 4; round++) {
      rec.end();
      vi.advanceTimersByTime(QUICK_RESTART_DELAY_MS);
      vi.advanceTimersByTime(QUICK_END_MS * 2);
      rec.end();
    }
    expect(cb.onEnd).not.toHaveBeenCalled();
  });

  it('stop finishes without a restart', () => {
    const engine = engineOrThrow();
    const cb = callbacks();
    engine.start({ locale: 'en-US' }, cb);
    const rec = FakeRecognition.current;
    rec.emit([['last words', false]]);
    engine.stop();
    expect(rec.stops).toBe(1);
    expect(cb.onFinal).toHaveBeenCalledWith('last words');
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
    expect(rec.starts).toBe(1);
  });

  it('stop during a pending restart ends at once', () => {
    const engine = engineOrThrow();
    const cb = callbacks();
    engine.start({ locale: 'en-US' }, cb);
    const rec = FakeRecognition.current;
    rec.end();
    engine.stop();
    vi.advanceTimersByTime(QUICK_RESTART_DELAY_MS * 2);
    expect(rec.starts).toBe(1);
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
  });

  it('abort drops the phrase in progress', () => {
    const engine = engineOrThrow();
    const cb = callbacks();
    engine.start({ locale: 'en-US' }, cb);
    const rec = FakeRecognition.current;
    rec.emit([['never mind', false]]);
    engine.abort();
    expect(rec.aborts).toBe(1);
    expect(cb.onFinal).not.toHaveBeenCalled();
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
    expect(rec.onresult).toBeNull();
  });

  it('starting again aborts the session before it', () => {
    const engine = engineOrThrow();
    const first = callbacks();
    const second = callbacks();
    engine.start({ locale: 'en-US' }, first);
    const firstRec = FakeRecognition.current;
    engine.start({ locale: 'es-US' }, second);
    expect(firstRec.aborts).toBe(1);
    expect(first.onEnd).toHaveBeenCalledTimes(1);
    expect(FakeRecognition.current).not.toBe(firstRec);
    expect(second.onStart).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not-allowed', 'mic-blocked'],
    ['service-not-allowed', 'mic-blocked'],
    ['audio-capture', 'no-mic'],
    ['language-not-supported', 'language-unsupported'],
    ['network', 'network'],
    ['bad-grammar', 'unknown'],
  ])('maps %s to %s and does not restart', (error, code) => {
    const engine = engineOrThrow();
    const cb = callbacks();
    engine.start({ locale: 'en-US' }, cb);
    const rec = FakeRecognition.current;
    vi.advanceTimersByTime(QUICK_END_MS * 2);
    rec.error(error);
    rec.end();
    expect(cb.onError).toHaveBeenCalledWith(code);
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
    expect(rec.starts).toBe(1);
  });

  it.each(['no-speech', 'aborted'])('%s is not an error', (error) => {
    expect(mapRecognitionError(error)).toBeNull();
    const engine = engineOrThrow();
    const cb = callbacks();
    engine.start({ locale: 'en-US' }, cb);
    const rec = FakeRecognition.current;
    vi.advanceTimersByTime(QUICK_END_MS * 8);
    rec.error(error);
    rec.end();
    expect(cb.onError).not.toHaveBeenCalled();
    expect(rec.starts).toBe(2);
  });

  it('reports a start that throws', () => {
    const engine = engineOrThrow();
    const cb = callbacks();
    FakeRecognition.failStart = true;
    engine.start({ locale: 'en-US' }, cb);
    expect(cb.onError).toHaveBeenCalledWith('unknown');
    expect(cb.onEnd).toHaveBeenCalledTimes(1);
  });
});
