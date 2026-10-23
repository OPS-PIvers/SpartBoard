import { describe, it, expect } from 'vitest';
import { liveStudentLabels } from '@/components/widgets/liveControlLabels';
import type { LiveStudent } from '@/types';

const student = (id: string, pin: string, joinedAt: number): LiveStudent => ({
  id,
  pin,
  status: 'active',
  joinedAt,
  lastActive: joinedAt,
});

describe('liveStudentLabels', () => {
  it('labels a unique PIN plainly', () => {
    const labels = liveStudentLabels([student('a', '1234', 1)]);
    expect(labels.get('a')).toEqual({ label: 'PIN 1234', duplicate: false });
  });

  it('numbers devices sharing a PIN in join order', () => {
    const labels = liveStudentLabels([
      student('late', '1234', 20),
      student('other', '5678', 5),
      student('early', '1234', 10),
    ]);
    expect(labels.get('early')).toEqual({
      label: 'PIN 1234 (1)',
      duplicate: true,
    });
    expect(labels.get('late')).toEqual({
      label: 'PIN 1234 (2)',
      duplicate: true,
    });
    expect(labels.get('other')?.duplicate).toBe(false);
  });

  it('breaks joinedAt ties by id so the numbering is stable', () => {
    const labels = liveStudentLabels([
      student('b', '1', 1),
      student('a', '1', 1),
    ]);
    expect(labels.get('a')?.label).toBe('PIN 1 (1)');
    expect(labels.get('b')?.label).toBe('PIN 1 (2)');
  });
});
