import type {
  DictationController,
  UseDictationOptions,
} from '@/utils/speechToText/types';

const noop = () => undefined;

/** Stub: reports dictation as unsupported until the engine lands. */
export function useDictation(
  options: UseDictationOptions
): DictationController {
  return {
    supported: false,
    status: 'idle',
    error: null,
    interim: '',
    language: options.languages[0] ?? 'en',
    languages: options.languages,
    setLanguage: noop,
    start: noop,
    stop: noop,
    toggle: noop,
  };
}
