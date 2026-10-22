import {
  parseIntakePageMessage,
  stepForPage,
  type IntakeDraft,
  type IntakeTarget,
  type RecordedWebStep,
} from '@/components/tours/web/recorderProtocol';

// Steps saved with no editor open go through a SpartBoard intake tab (WEB_TOURS_UX.md U17); D3 still holds.
const JOBS_KEY = 'recorder.jobs';
const SAVED_KEY = 'recorder.saved';
const INTAKE_PATH = '/web-tour-intake';
const BATCH = 10;

export interface IntakeJob {
  jobId: string;
  target: IntakeTarget;
  /** Set once the intake tab created the job's new draft; later batches append to it. */
  setId?: string;
  title: string;
  steps: RecordedWebStep[];
  failed?: boolean;
}

export interface IntakeStatus {
  phase: 'none' | 'opening' | 'signin' | 'denied' | 'ready';
  drafts: IntakeDraft[];
  pending: number;
  failed: boolean;
  /** The last job that finished: where its steps went, to open it in SpartBoard. */
  saved: { setId: string; title: string; origin: string } | null;
}

const session = () => chrome.storage.session;

const readJobs = async (): Promise<IntakeJob[]> => {
  const got = (await session().get(JOBS_KEY))[JOBS_KEY];
  return Array.isArray(got) ? (got as IntakeJob[]) : [];
};
const writeJobs = (jobs: IntakeJob[]) => session().set({ [JOBS_KEY]: jobs });

export function createIntake(origins: readonly string[], notify: () => void) {
  let port: chrome.runtime.Port | null = null;
  let portOrigin = origins[0] ?? '';
  let phase: IntakeStatus['phase'] = 'none';
  let drafts: IntakeDraft[] = [];
  // The protocol the intake tab reviews; a tab from before protocol 4 never says.
  let pageProtocol = 0;
  const forPage = (steps: RecordedWebStep[]) =>
    steps.map((s) => stepForPage(s, pageProtocol));
  let openedTab: number | null = null;
  // New-draft jobs whose first batch went out on this port, waiting for `intake/created`.
  const awaitingDraft = new Set<string>();

  const post = (msg: object) => {
    try {
      port?.postMessage(msg);
    } catch {
      // Closed; the next ensure() reopens the tab and the jobs go again.
    }
  };

  /** Posts every job the tab hasn't saved; a new draft gets one batch until it exists, so it is made once. */
  const flush = async () => {
    if (!port || phase !== 'ready') return;
    for (const job of await readJobs()) {
      if (job.failed) continue;
      if (job.target.kind === 'new' && !job.setId) {
        if (awaitingDraft.has(job.jobId)) continue;
        awaitingDraft.add(job.jobId);
        post({
          type: 'intake/save',
          jobId: job.jobId,
          target: job.target,
          steps: forPage(job.steps.slice(0, BATCH)),
        });
        continue;
      }
      const target: IntakeTarget = job.setId
        ? { kind: 'append', setId: job.setId }
        : job.target;
      for (let i = 0; i < job.steps.length; i += BATCH)
        post({
          type: 'intake/save',
          jobId: job.jobId,
          target,
          steps: forPage(job.steps.slice(i, i + BATCH)),
        });
    }
  };

  const closeOpenedTab = async () => {
    if (openedTab === null || (await readJobs()).length > 0) return;
    const tabId = openedTab;
    openedTab = null;
    await chrome.tabs.remove(tabId).catch(() => undefined);
  };

  /** The SpartBoard origin to use: one the author already has open, else the listing's first. */
  const pickOrigin = async (): Promise<string> => {
    const tabs = await chrome.tabs
      .query({ url: origins.map((o) => `${o}/*`) })
      .catch(() => []);
    for (const tab of tabs) {
      const origin = tab.url ? new URL(tab.url).origin : '';
      if (origins.includes(origin)) return origin;
    }
    return origins[0] ?? '';
  };

  return {
    handlePort(p: chrome.runtime.Port) {
      port?.disconnect();
      port = p;
      awaitingDraft.clear();
      pageProtocol = 0;
      const url = p.sender?.url;
      if (url) portOrigin = new URL(url).origin;
      p.onMessage.addListener((raw) => {
        void (async () => {
          if (port !== p) return;
          const msg = parseIntakePageMessage(raw);
          if (!msg) return;
          if (msg.type === 'intake/ready') {
            phase = 'ready';
            drafts = msg.drafts;
            pageProtocol = msg.protocol ?? 0;
            await flush();
          } else if (msg.type === 'intake/signin') {
            phase = 'signin';
            // Signing in needs the author, so the tab comes to the front.
            const tab = p.sender?.tab;
            if (tab?.id !== undefined) {
              await chrome.tabs
                .update(tab.id, { active: true })
                .catch(() => undefined);
              if (tab.windowId !== undefined)
                await chrome.windows
                  .update(tab.windowId, { focused: true })
                  .catch(() => undefined);
            }
          } else if (msg.type === 'intake/denied') {
            phase = 'denied';
          } else {
            const jobs = await readJobs();
            const job = jobs.find((j) => j.jobId === msg.jobId);
            if (!job) return;
            if (msg.type === 'intake/created') {
              job.setId = msg.setId;
              awaitingDraft.delete(job.jobId);
              await writeJobs(jobs);
              await flush();
            } else if (msg.type === 'intake/failed') {
              job.failed = true;
              awaitingDraft.delete(job.jobId);
              await writeJobs(jobs);
            } else {
              job.steps = job.steps.filter((s) => s.id !== msg.stepId);
              const setId =
                job.setId ??
                (job.target.kind === 'append' ? job.target.setId : null);
              const left = jobs.filter((j) => j.steps.length > 0);
              await writeJobs(left);
              if (job.steps.length === 0 && setId) {
                await session().set({
                  [SAVED_KEY]: { setId, title: job.title, origin: portOrigin },
                });
                await closeOpenedTab();
              }
            }
          }
          notify();
        })();
      });
      p.onDisconnect.addListener(() => {
        if (port !== p) return;
        port = null;
        phase = 'none';
        awaitingDraft.clear();
        pageProtocol = 0;
        notify();
      });
    },

    /** Opens an intake tab in the background unless one is connected or opening. */
    async ensure(): Promise<void> {
      if (port || phase === 'opening') return;
      phase = 'opening';
      notify();
      const origin = await pickOrigin();
      const tab = await chrome.tabs
        .create({ url: `${origin}${INTAKE_PATH}`, active: false })
        .catch(() => null);
      openedTab = tab?.id ?? null;
      if (!tab) phase = 'none';
      notify();
    },

    /** Queues steps for the intake tab, adding to `jobId` when given; the job id, or null when storage can't hold them. */
    async save(
      target: IntakeTarget,
      title: string,
      steps: RecordedWebStep[],
      jobId?: string
    ): Promise<string | null> {
      const jobs = await readJobs();
      const existing = jobId ? jobs.find((j) => j.jobId === jobId) : undefined;
      if (jobId && !existing) return null;
      const job = existing ?? {
        jobId: crypto.randomUUID(),
        target,
        title,
        steps: [],
      };
      const ids = new Set(job.steps.map((s) => s.id));
      job.steps.push(...steps.filter((s) => !ids.has(s.id)));
      if (!existing) jobs.push(job);
      const stored = await writeJobs(jobs).then(
        () => true,
        () => false
      );
      if (!stored) return null;
      await session().remove(SAVED_KEY);
      await this.ensure();
      await flush();
      return job.jobId;
    },

    /** Sends failed jobs again. */
    async retry(): Promise<void> {
      const jobs = await readJobs();
      for (const job of jobs) delete job.failed;
      await writeJobs(jobs);
      await this.ensure();
      await flush();
    },

    /** The panel left the Send form: drop the finished notice and close a tab nothing needs. */
    async idle(): Promise<void> {
      await session().remove(SAVED_KEY);
      await closeOpenedTab();
      notify();
    },

    async status(): Promise<IntakeStatus> {
      const jobs = await readJobs();
      const saved = (await session().get(SAVED_KEY))[SAVED_KEY] as
        IntakeStatus['saved'] | undefined;
      return {
        phase,
        drafts,
        pending: jobs.reduce((n, j) => n + j.steps.length, 0),
        failed: jobs.some((j) => j.failed),
        saved: saved ?? null,
      };
    },
  };
}

export type Intake = ReturnType<typeof createIntake>;
