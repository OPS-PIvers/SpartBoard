import { afterEach, describe, expect, it, vi } from 'vitest';
import { hearIt, hearItVoice, pickVoice } from './hearIt';

const v = (lang: string, localService = false) => ({
  lang,
  localService,
  default: false,
  name: lang,
});

describe('pickVoice', () => {
  const voices = [v('en-GB'), v('en-US'), v('es-ES'), v('es-US'), v('de-DE')];

  it('takes the exact dialect', () => {
    expect(pickVoice(voices, 'en-US')?.lang).toBe('en-US');
    expect(pickVoice(voices, 'de-DE')?.lang).toBe('de-DE');
    expect(pickVoice(voices, 'es-ES')?.lang).toBe('es-ES');
  });

  it('reads es-419 as a Latin American voice before Spain', () => {
    expect(pickVoice(voices, 'es-419')?.lang).toBe('es-US');
    expect(pickVoice([v('es-ES'), v('es_MX')], 'es-419')?.lang).toBe('es_MX');
    expect(pickVoice([v('es-ES')], 'es-419')?.lang).toBe('es-ES');
  });

  it('falls back to the primary subtag and prefers a local voice', () => {
    expect(pickVoice([v('de-AT'), v('de-CH', true)], 'de-DE')?.lang).toBe(
      'de-CH'
    );
  });

  it('is null when no voice speaks the language', () => {
    expect(pickVoice(voices, 'fr-FR')).toBeNull();
    expect(pickVoice([], 'en-US')).toBeNull();
  });
});

describe('hearIt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing without speech synthesis', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    expect(hearItVoice('en-US')).toBeNull();
    expect(hearIt('hola', 'es-419').started).toBe(false);
  });

  it('speaks with the matched voice and stops on request', () => {
    const synth = {
      getVoices: () => [v('es-MX')],
      speak: vi.fn(),
      cancel: vi.fn(),
    };
    class Utterance {
      text: string;
      voice: unknown = null;
      lang = '';
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    const onEnd = vi.fn();
    const { started, stop } = hearIt('perro', 'es-419', { onEnd });
    expect(started).toBe(true);
    const utterance = synth.speak.mock.calls[0][0] as Utterance;
    expect(utterance).toMatchObject({
      text: 'perro',
      lang: 'es-MX',
      rate: 0.9,
    });
    utterance.onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
    stop();
    expect(synth.cancel).toHaveBeenCalledTimes(2);
  });
});
