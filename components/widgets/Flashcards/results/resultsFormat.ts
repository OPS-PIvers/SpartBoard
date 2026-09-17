/** Minutes/hours/days since `timestamp`; "not started" when it is zero. */
export const relativeTime = (timestamp: number, now: number): string => {
  if (!timestamp) return 'not started';
  if (!now) return '';
  const minutes = Math.round((now - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};
