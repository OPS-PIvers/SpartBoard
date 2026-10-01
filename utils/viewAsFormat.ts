/** D10 banner label for the target's most recent activity. */
export function formatLastActive(at: number, now: number): string {
  if (!at) return 'No recent activity';
  const mins = Math.floor((now - at) / 60_000);
  if (mins < 1) return 'Active just now';
  if (mins < 60) return `Active ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours} h ago`;
  return `Active ${new Date(at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}
