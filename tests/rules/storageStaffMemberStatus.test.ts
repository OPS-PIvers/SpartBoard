// Storage districtStaffMember(): only an `active` or `invited` non-student member counts as staff.
// The emulator cannot resolve storage's firestore.get() member lookup, so the status gate is pinned by source.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const DENIED_STATUSES = ['inactive', 'removed', 'foo'];

const rules = readFileSync(
  fileURLToPath(new URL('../../storage.rules', import.meta.url)),
  'utf8'
);

const functionBody = (name: string): string =>
  new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n {4}\\}`).exec(
    rules
  )?.[1] ?? '';

// Evaluates the rule's `status in [...]` clause for a member doc status (a missing field defaults to active).
const statusAdmitted = (body: string, status: string | undefined): boolean => {
  const list = /member\.data\.get\('status', 'active'\) in \[([^\]]*)\]/.exec(
    body
  )?.[1];
  const allowed = [...(list ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]);
  return allowed.includes(status ?? 'active');
};

describe('storage districtStaffMember status gate', () => {
  it('admits active, invited and a missing status', () => {
    const body = functionBody('districtStaffMember');
    expect(body).toContain('member != null');
    for (const status of ['active', 'invited', undefined]) {
      expect(statusAdmitted(body, status)).toBe(true);
    }
  });

  it('refuses inactive, removed and unknown statuses', () => {
    const body = functionBody('districtStaffMember');
    for (const status of DENIED_STATUSES) {
      expect(statusAdmitted(body, status)).toBe(false);
    }
  });

  it('keeps liveMember() on the same status list as districtStaffMember()', () => {
    const live = functionBody('liveMember');
    const staff = functionBody('districtStaffMember');
    for (const status of [...DENIED_STATUSES, 'invited', 'active']) {
      expect(statusAdmitted(live, status)).toBe(statusAdmitted(staff, status));
    }
  });

  it('still refuses a student-role member whatever the status', () => {
    expect(functionBody('districtStaffMember')).toContain(
      "member.data.get('roleId', '') != 'student'"
    );
  });
});
