// Initials for member avatars, from a display name or an email's local part.

export function initials(name: string): string {
  const base = name.includes('@') ? (name.split('@')[0] ?? '') : name;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0]?.charAt(0) ?? '?').toUpperCase();
  return (
    (parts[0]?.charAt(0) ?? '') + (parts[1]?.charAt(0) ?? '')
  ).toUpperCase();
}
