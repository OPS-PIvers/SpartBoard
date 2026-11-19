import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import {
  DEFAULT_SPEECH_TO_TEXT_SETTINGS,
  SPEECH_TO_TEXT_ACCESS_CALLABLE,
} from '@/config/speechToText';
import type { SpeechToTextSettings } from '@/types';
import type { SpeechToTextAccessRequest } from '@/utils/speechToText/types';

// Asked once per page per assignment; an error or refusal means both extras are off.
const pending = new Map<string, Promise<SpeechToTextSettings>>();
const loaded = new Map<string, SpeechToTextSettings>();

function readAccess(raw: unknown): SpeechToTextSettings {
  if (typeof raw !== 'object' || raw === null)
    return DEFAULT_SPEECH_TO_TEXT_SETTINGS;
  const data: { transcription?: unknown; tidyUp?: unknown } = raw;
  return {
    engine: data.transcription === true ? 'hybrid' : 'browser',
    tidyUp: data.tidyUp === true,
  };
}

function loadSettings(assignmentId: string): Promise<SpeechToTextSettings> {
  const existing = pending.get(assignmentId);
  if (existing) return existing;
  const call = httpsCallable<SpeechToTextAccessRequest, unknown>(
    functions,
    SPEECH_TO_TEXT_ACCESS_CALLABLE
  );
  const request = call({ assignmentId })
    .then((result) => readAccess(result.data))
    .catch(() => DEFAULT_SPEECH_TO_TEXT_SETTINGS)
    .then((settings) => {
      loaded.set(assignmentId, settings);
      return settings;
    });
  pending.set(assignmentId, request);
  return request;
}

/** Test hook: forget the answers from earlier on this page. */
export function resetSpeechToTextSettingsCache(): void {
  pending.clear();
  loaded.clear();
}

/** Which paid Speech to text extras this assignment allows; all off until answered, and with no assignment. */
export function useSpeechToTextSettings(
  assignmentId: string | undefined
): SpeechToTextSettings {
  const [answer, setAnswer] = useState<{
    assignmentId: string;
    settings: SpeechToTextSettings;
  } | null>(null);

  useEffect(() => {
    if (assignmentId === undefined || loaded.has(assignmentId)) return;
    let alive = true;
    void loadSettings(assignmentId).then((settings) => {
      if (alive) setAnswer({ assignmentId, settings });
    });
    return () => {
      alive = false;
    };
  }, [assignmentId]);

  if (assignmentId === undefined) return DEFAULT_SPEECH_TO_TEXT_SETTINGS;
  if (answer?.assignmentId === assignmentId) return answer.settings;
  return loaded.get(assignmentId) ?? DEFAULT_SPEECH_TO_TEXT_SETTINGS;
}
