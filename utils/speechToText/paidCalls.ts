import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import {
  SPEECH_TO_TEXT_TIDY_CALLABLE,
  SPEECH_TO_TEXT_TRANSCRIBE_CALLABLE,
} from '@/config/speechToText';
import type {
  PaidDictationFallback,
  PaidDictationResponse,
  TidyDictationRequest,
  TranscribeSpeechRequest,
} from './types';

export type TranscribeSpeechCall = (
  request: TranscribeSpeechRequest
) => Promise<PaidDictationResponse>;

export type TidyDictationCall = (
  request: TidyDictationRequest
) => Promise<PaidDictationResponse>;

const FALLBACKS: readonly PaidDictationFallback[] = [
  'off',
  'cap',
  'ineligible',
  'error',
];

/** Anything that is not text or a known fallback counts as an error (D10). */
export function readPaidResponse(raw: unknown): PaidDictationResponse {
  if (typeof raw !== 'object' || raw === null) return { fallback: 'error' };
  const data = raw as { text?: unknown; fallback?: unknown };
  if (typeof data.text === 'string') return { text: data.text };
  const fallback = FALLBACKS.find((code) => code === data.fallback);
  return { fallback: fallback ?? 'error' };
}

export const callTranscribeSpeech: TranscribeSpeechCall = async (request) => {
  const call = httpsCallable<TranscribeSpeechRequest, unknown>(
    functions,
    SPEECH_TO_TEXT_TRANSCRIBE_CALLABLE
  );
  return readPaidResponse((await call(request)).data);
};

export const callTidyDictation: TidyDictationCall = async (request) => {
  const call = httpsCallable<TidyDictationRequest, unknown>(
    functions,
    SPEECH_TO_TEXT_TIDY_CALLABLE
  );
  return readPaidResponse((await call(request)).data);
};

// Once the server says no, this page stops asking (D10).
let transcribeOff = false;
let tidyOff = false;

export const isPaidTranscribeOff = (): boolean => transcribeOff;
export const markPaidTranscribeOff = (): void => {
  transcribeOff = true;
};
export const isTidyUpOff = (): boolean => tidyOff;
export const markTidyUpOff = (): void => {
  tidyOff = true;
};

/** Test hook: forget refusals from earlier on this page. */
export function resetPaidDictationState(): void {
  transcribeOff = false;
  tidyOff = false;
}

/** Rejects when `promise` takes longer than `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('failed'));
      }
    );
  });
}
