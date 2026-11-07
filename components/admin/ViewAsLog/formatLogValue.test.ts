import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { formatLogValue } from '@/components/admin/ViewAsLog/formatLogValue';

describe('formatLogValue live timestamps', () => {
  it('prints a Firestore Timestamp as a date, not its toJSON shape', () => {
    const ms = Date.UTC(2026, 0, 2, 3, 4, 5);
    const out = formatLogValue({ at: Timestamp.fromMillis(ms) });
    expect(out).toContain(JSON.stringify(new Date(ms).toLocaleString()));
    expect(out).not.toContain('seconds');
  });
});
