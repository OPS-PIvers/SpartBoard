import { httpsCallable } from 'firebase/functions';
import { functions, isAuthBypass } from '@/config/firebase';

export interface StudentLoadIssueInput {
  source: 'class' | 'pointer' | 'hydrate';
  collection: string;
  channel?: 'active' | 'ended';
  code: string;
  attempt: number;
  gaveUp: boolean;
}

const FLUSH_DELAY_MS = 3_000;
const MAX_PER_PAGE = 10;

let queue: StudentLoadIssueInput[] = [];
let sent = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const seen = new Set<string>();

function flush(): void {
  timer = null;
  const batch = queue.slice(0, MAX_PER_PAGE - sent);
  queue = [];
  if (batch.length === 0) return;
  sent += batch.length;
  const call = httpsCallable<{ issues: StudentLoadIssueInput[] }, unknown>(
    functions,
    'reportStudentLoadIssueV1'
  );
  call({ issues: batch }).catch(() => {
    // Reporting is best effort; the page already shows its own retry banner.
  });
}

/** Queues one failure report per (source, collection, channel, outcome) for this page load. */
export function reportStudentLoadIssue(issue: StudentLoadIssueInput): void {
  if (isAuthBypass) return;
  const key = `${issue.source}:${issue.collection}:${issue.channel ?? ''}:${issue.gaveUp ? 'gave-up' : 'failed'}`;
  if (seen.has(key) || sent + queue.length >= MAX_PER_PAGE) return;
  seen.add(key);
  queue.push(issue);
  timer ??= setTimeout(flush, FLUSH_DELAY_MS);
}

/** Test-only: clears the per-page dedupe and cap. */
export function resetStudentLoadIssuesForTest(): void {
  queue = [];
  sent = 0;
  seen.clear();
  if (timer) clearTimeout(timer);
  timer = null;
}
