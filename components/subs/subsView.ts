/**
 * Small presentation helpers shared by the substitute portal screens.
 * Display-only — no Firestore, no auth, no React.
 */

const ACCENT_PALETTE = [
  'bg-brand-blue-primary',
  'bg-emerald-600',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-cyan-600',
  'bg-orange-500',
  'bg-pink-500',
];

/** Stable per-share accent color so the same teacher card stays the same hue. */
export function teacherCardAccent(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return (
    ACCENT_PALETTE[Math.abs(hash) % ACCENT_PALETTE.length] ?? 'bg-slate-500'
  );
}

/** Up-to-2-character initials from a display name or email. */
export function teacherInitials(name: string): string {
  if (!name) return '?';
  const cleaned = name.replace(/[<>]/g, '').trim();
  if (cleaned.includes('@')) {
    const local = cleaned.split('@')[0] ?? cleaned;
    return local.slice(0, 2).toUpperCase();
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Human-readable "Expires in 3h" / "Expires tomorrow, 8:00 AM" string. */
export function formatExpiresAt(ts: number, now = Date.now()): string {
  const ms = ts - now;
  if (ms <= 0) return 'Expired';
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) {
    const mins = Math.max(1, Math.round(ms / 60000));
    return `Expires in ${mins} min`;
  }
  const d = new Date(ts);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const isTomorrow =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate() + 1;
  const timeStr = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (isToday) return `Expires today, ${timeStr}`;
  if (isTomorrow) return `Expires tomorrow, ${timeStr}`;
  return `Expires ${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}, ${timeStr}`;
}
