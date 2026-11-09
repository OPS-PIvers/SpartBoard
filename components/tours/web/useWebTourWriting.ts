import { useState } from 'react';
import type { GuidedLearningSet } from '@/types';
import { logError } from '@/utils/logError';
import { webTourEditorDevSeed } from './webEditorDevSeed';
import {
  applyWriting,
  requestWebTourWriting,
  undoWriting,
  writingRequests,
  type WritingMode,
  type WritingUndo,
} from './writeWithClaude';

type Change = (update: (s: GuidedLearningSet) => GuidedLearningSet) => void;

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// "3", "3 and 5", "3, 5 and 9".
const listNumbers = (ns: number[]) =>
  ns.length < 2
    ? ns.join('')
    : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;

export interface WebTourWriting {
  busy: boolean;
  /** Steps Claude asked about; Run again for questions shows while there are any. */
  asked: boolean;
  canUndo: boolean;
  run: (mode: WritingMode) => Promise<void>;
  undo: () => void;
}

/** Write with Claude: one run at a time, with one Undo for the last run's words. */
export function useWebTourWriting({
  set,
  change,
  flush,
  onStatus,
}: {
  set: GuidedLearningSet;
  change: Change;
  /** Saves the draft now and returns it, so the server reads what is on screen. */
  flush: () => Promise<GuidedLearningSet>;
  onStatus: (status: string) => void;
}): WebTourWriting {
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<WritingUndo | null>(null);

  const run = async (mode: WritingMode) => {
    setBusy(true);
    onStatus('');
    try {
      const saved = await flush();
      const requests = writingRequests(saved, mode);
      if (requests.length === 0) {
        onStatus('Every title and tip is filled in.');
        return;
      }
      const seeded = webTourEditorDevSeed()?.writing;
      const { steps: written, failed } = seeded
        ? seeded(requests)
        : await requestWebTourWriting(saved.id, requests);
      const ran: { r?: ReturnType<typeof applyWriting> } = {};
      change((cur) => {
        ran.r = applyWriting(cur, written, mode);
        return ran.r.set;
      });
      const failedNumbers = saved.steps.flatMap((s, i) =>
        failed.includes(s.id) ? [i + 1] : []
      );
      const { r } = ran;
      if (!r) return;
      setUndo(Object.keys(r.undo).length ? r.undo : null);
      const parts = [
        r.wrote ? `Claude wrote ${count(r.wrote, 'step', 'steps')}.` : '',
        r.asked ? `Claude asked about ${count(r.asked, 'step', 'steps')}.` : '',
        failedNumbers.length
          ? `Claude couldn't write ${failedNumbers.length === 1 ? 'step' : 'steps'} ${listNumbers(failedNumbers)}. Try again.`
          : '',
      ].filter(Boolean);
      onStatus(parts.join(' ') || 'Claude had nothing to add.');
    } catch (err) {
      logError('web tour writing', err, { setId: set.id });
      onStatus("Claude couldn't write the steps. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    asked: set.steps.some((s) => s.web?.claudeQuestion),
    canUndo: !!undo,
    run,
    undo: () => {
      if (!undo) return;
      change((cur) => undoWriting(cur, undo));
      setUndo(null);
      onStatus('');
    },
  };
}
