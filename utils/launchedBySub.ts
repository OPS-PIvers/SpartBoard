import type { SubLaunchedSessionFields } from '@/types';

/** "Launched by {sub} · {day}", or an empty string when there is no stamp. */
export function launchedBySubLabel(
  launchedBy: SubLaunchedSessionFields['launchedBy'],
  at?: number | null
): string {
  const email = launchedBy?.email;
  if (!email) return '';
  if (typeof at !== 'number' || !Number.isFinite(at)) {
    return `Launched by ${email}`;
  }
  const day = new Date(at).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `Launched by ${email} · ${day}`;
}
