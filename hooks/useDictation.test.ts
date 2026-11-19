import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeRecognition,
  installFakeRecognition,
} from '@/utils/speechToText/fakeRecognition';
import type { UseDictationOptions } from '@/utils/speechToText/types';
import { resetDictationPreference, useDictation } from './useDictation';

const setup = (overrides: Partial<UseDictationOptions> = {}) => {
  const onCommit = vi.fn();
  const onUndo = vi.fn();
  const view = renderHook(
    (props: Partial<UseDictationOptions>) =>
      useDictation({
        enabled: true,
        languages: ['en'],
        onCommit,
        onUndo,
        ...props,
      }),
    { initialProps: overrides }
  );
  return { ...view, onCommit, onUndo };
};

const rec = () => FakeRecognition.current;

describe('useDictation without browser recognition', () => {
  it('is unsupported and start does nothing', () => {
    const { result } = setup();
    expect(result.current.supported).toBe(false);
    act(() => result.current.start());
    expect(result.current.status).toBe('idle');
  });
});

describe('useDictation', () => {
  let uninstall: () => void;

  beforeEach(() => {
    resetDictationPreference();
    uninstall = installFakeRecognition();
  });

  afterEach(() => {
    uninstall();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('is unsupported while disabled', () => {
    const { result } = setup({ enabled: false });
    expect(result.current.supported).toBe(false);
    act(() => result.current.toggle());
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it('listens, shows interim words and commits tidied text', () => {
    const { result, onCommit } = setup();
    expect(result.current.supported).toBe(true);
    act(() => result.current.start());
    expect(result.current.status).toBe('listening');
    expect(rec().lang).toBe('en-US');

    act(() => rec().emit([['the cat', false]]));
    expect(result.current.interim).toBe('the cat');
    expect(onCommit).not.toHaveBeenCalled();

    act(() => rec().final('the cat sat period'));
    expect(onCommit).toHaveBeenLastCalledWith('The cat sat.');
    expect(result.current.interim).toBe('');

    act(() => rec().final('it purred'));
    expect(onCommit).toHaveBeenLastCalledWith(' It purred');
  });

  it('uses the text before the caret when given', () => {
    const { result, onCommit } = setup({ textBefore: () => 'Dogs are' });
    act(() => result.current.start());
    act(() => rec().final('i think loyal'));
    expect(onCommit).toHaveBeenCalledWith(' I think loyal');
  });

  it('calls the latest onCommit after a re-render', () => {
    const { result, rerender, onCommit } = setup();
    act(() => result.current.start());
    const later = vi.fn();
    rerender({ onCommit: later });
    act(() => rec().final('hello'));
    expect(later).toHaveBeenCalledWith('Hello');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('toggle stops and returns to idle', () => {
    const { result } = setup();
    act(() => result.current.toggle());
    expect(result.current.status).toBe('listening');
    act(() => result.current.toggle());
    expect(rec().stops).toBe(1);
    expect(result.current.status).toBe('idle');
  });

  it('keeps listening when the browser ends the session', () => {
    vi.useFakeTimers();
    try {
      const { result, onCommit } = setup();
      act(() => result.current.start());
      vi.advanceTimersByTime(10_000);
      act(() => rec().end());
      expect(result.current.status).toBe('listening');
      expect(rec().starts).toBe(2);
      act(() => rec().final('still here'));
      expect(onCommit).toHaveBeenCalledWith('Still here');
    } finally {
      vi.useRealTimers();
    }
  });

  it('single phrase stops after the first commit', () => {
    const { result, onCommit } = setup({ singlePhrase: true });
    act(() => result.current.start());
    act(() => rec().final('photosynthesis'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(rec().stops).toBe(1);
    expect(result.current.status).toBe('idle');
  });

  it('"undo that" hands back the last committed text', () => {
    const { result, onCommit, onUndo } = setup();
    act(() => result.current.start());
    act(() => rec().final('one'));
    act(() => rec().final('two'));
    act(() => rec().final('undo that'));
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onUndo).toHaveBeenLastCalledWith(' two');
    act(() => rec().final('Undo that.'));
    expect(onUndo).toHaveBeenLastCalledWith('One');
    act(() => rec().final('undo that'));
    expect(onUndo).toHaveBeenCalledTimes(2);
  });

  it('switches language and restarts while listening', () => {
    const { result } = setup({ languages: ['en', 'es'] });
    expect(result.current.language).toBe('en');
    expect(result.current.languages).toEqual(['en', 'es']);
    act(() => result.current.start());
    const first = rec();
    act(() => result.current.setLanguage('es'));
    expect(first.aborts).toBe(1);
    expect(rec()).not.toBe(first);
    expect(rec().lang).toBe('es-US');
    expect(result.current.language).toBe('es');
    expect(result.current.status).toBe('listening');
  });

  it('ignores a language that is not offered and drops ones with no locale', () => {
    const { result } = setup({ languages: ['en', 'hmn'] });
    expect(result.current.languages).toEqual(['en']);
    act(() => result.current.setLanguage('fr'));
    expect(result.current.language).toBe('en');
  });

  it('remembers the picked language for the next text box', () => {
    const first = setup({ languages: ['en', 'es'] });
    act(() => first.result.current.setLanguage('es'));
    const second = setup({ languages: ['en', 'es'] });
    expect(second.result.current.language).toBe('es');
  });

  it('falls back to English when the language is not recognised', () => {
    const { result, onCommit } = setup({ languages: ['en', 'so'] });
    act(() => result.current.setLanguage('so'));
    act(() => result.current.start());
    const somali = rec();
    expect(somali.lang).toBe('so-SO');
    act(() => somali.error('language-not-supported'));
    expect(result.current.error).toBe('language-unsupported');
    expect(result.current.language).toBe('en');
    expect(result.current.languages).toEqual(['en']);
    expect(rec()).not.toBe(somali);
    expect(rec().lang).toBe('en-US');
    expect(result.current.status).toBe('listening');
    act(() => rec().final('hello'));
    expect(onCommit).toHaveBeenCalledWith('Hello');

    act(() => result.current.stop());
    act(() => result.current.start());
    expect(result.current.error).toBeNull();
  });

  it('surfaces a blocked microphone and goes idle', () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => {
      rec().error('not-allowed');
      rec().end();
    });
    expect(result.current.error).toBe('mic-blocked');
    expect(result.current.status).toBe('idle');
    act(() => result.current.start());
    expect(result.current.error).toBeNull();
  });

  it('stops when the page is hidden', () => {
    const { result } = setup();
    act(() => result.current.start());
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(rec().aborts).toBe(1);
    expect(result.current.status).toBe('idle');
  });

  it('stops on unmount and when disabled', () => {
    const { result, unmount } = setup();
    act(() => result.current.start());
    unmount();
    expect(rec().aborts).toBe(1);

    const other = setup();
    act(() => other.result.current.start());
    other.rerender({ enabled: false });
    expect(rec().aborts).toBe(1);
    expect(other.result.current.supported).toBe(false);
    expect(other.result.current.status).toBe('idle');
  });
});
