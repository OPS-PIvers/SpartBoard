// Records the run of a tour started with `web-tour/open` (WEB_TOURS_HELP_PANEL.md H7), since no SpartBoard page is watching it.
import {
  startTourRunLog,
  type TourRun,
  type TourRunLog,
} from '@/components/tours/tourRunLog';
import type { WebTourPortPost } from '@/components/tours/web/extensionProtocol';
import { runFixClues } from '@/components/tours/web/fixClues';
import { scrubLocator } from '@/components/tours/web/recordedSteps';
import type { StepLocators } from './openTour';

interface SavedRun {
  run: TourRun;
  locators: StepLocators;
}

export interface RunRecorderDeps {
  load<T>(key: string): Promise<T | undefined>;
  save(entries: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  /** Sends the run to webTourRunV1. */
  send(setId: string, run: TourRun): Promise<void>;
}

const runKey = (setId: string) => `wt:run:${setId}`;

export function createRunRecorder(deps: RunRecorderDeps) {
  const logs = new Map<string, { log: TourRunLog; locators: StepLocators }>();
  const queues = new Map<string, Promise<unknown>>();
  const serial = (setId: string, fn: () => Promise<void>) => {
    const run = (queues.get(setId) ?? Promise.resolve()).then(fn, fn);
    queues.set(
      setId,
      run.catch(() => undefined)
    );
    return run;
  };

  // The run is kept in the session store too, so a restarted worker continues it.
  const open = (
    setId: string,
    locators: StepLocators,
    v: number,
    from?: TourRun
  ) => {
    const log = startTourRunLog(
      setId,
      '',
      { v, furthest: from?.furthest ?? 0, surface: 'web', from },
      async (run) => {
        if (run.done || run.exit !== undefined) {
          await deps.remove([runKey(setId)]);
        } else {
          const saved: SavedRun = { run, locators };
          await deps.save({ [runKey(setId)]: saved });
        }
        await deps.send(setId, run);
      }
    );
    const entry = { log, locators };
    logs.set(setId, entry);
    return entry;
  };

  const entryFor = async (setId: string) => {
    const live = logs.get(setId);
    if (live) return live;
    const saved = await deps.load<SavedRun>(runKey(setId));
    return saved ? open(setId, saved.locators, saved.run.v, saved.run) : null;
  };

  return {
    /** Starts a fresh run for a tour the extension opened itself. */
    begin: (setId: string, version: number, locators: StepLocators) =>
      serial(setId, async () => {
        await deps.remove([runKey(setId)]);
        open(setId, locators, version);
      }),

    /** A tour started some other way (a page's handoff or a check run) records nothing here. */
    forget: (setId: string) =>
      serial(setId, async () => {
        logs.delete(setId);
        await deps.remove([runKey(setId)]);
      }),

    /** Applies one progress post to the run, as the tour page does. */
    onPost: (post: WebTourPortPost) =>
      serial(post.setId, async () => {
        if ('runId' in post || post.type.startsWith('web-tour/check')) return;
        const entry = await entryFor(post.setId);
        if (!entry) return;
        const { log, locators } = entry;
        switch (post.type) {
          case 'web-tour/step':
            log.update({ furthest: post.stepIndex });
            log.match(post.stepId, post.match);
            break;
          case 'web-tour/suggest': {
            const own = locators[post.stepId];
            if (own)
              log.suggest(
                post.stepId,
                runFixClues(scrubLocator(post.locator), own)
              );
            break;
          }
          case 'web-tour/done':
            log.end({ done: true });
            logs.delete(post.setId);
            break;
          case 'web-tour/exit':
          case 'web-tour/closed':
            log.end({ done: false, exit: post.stepIndex });
            logs.delete(post.setId);
            break;
        }
      }),
  };
}
