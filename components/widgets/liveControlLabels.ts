import type { LiveStudent } from '@/types';

export interface LiveStudentLabel {
  label: string;
  duplicate: boolean;
}

// Numbers devices sharing a PIN in join order so Freeze/Remove can target the right one.
export const liveStudentLabels = (
  students: readonly LiveStudent[]
): Map<string, LiveStudentLabel> => {
  const byPin = new Map<string, LiveStudent[]>();
  for (const s of students) {
    const group = byPin.get(s.pin);
    if (group) group.push(s);
    else byPin.set(s.pin, [s]);
  }
  const labels = new Map<string, LiveStudentLabel>();
  for (const [pin, group] of byPin) {
    if (group.length === 1) {
      labels.set(group[0].id, { label: `PIN ${pin}`, duplicate: false });
      continue;
    }
    const ordered = [...group].sort(
      (a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)
    );
    ordered.forEach((s, i) => {
      labels.set(s.id, { label: `PIN ${pin} (${i + 1})`, duplicate: true });
    });
  }
  return labels;
};
