import { describe, it, expect } from 'vitest';
import { parseInvitesCsv, type CsvParseOptions } from './csvImport';

// Fixture roles/buildings mirror the shape of the Orono seed data used in
// hooks/useOrgRoles + hooks/useOrgBuildings so tests exercise realistic
// name/id matching (e.g. `teacher` id vs. `Teacher` display name, or
// `intermediate` id vs. `Intermediate School` display name).
const ROLES: CsvParseOptions['roles'] = [
  { id: 'super_admin', name: 'Super Admin' },
  { id: 'domain_admin', name: 'Domain Admin' },
  { id: 'building_admin', name: 'Building Admin' },
  { id: 'teacher', name: 'Teacher' },
  { id: 'student', name: 'Student' },
  { id: 'custom_role_xyz', name: 'Specialist' },
];

const BUILDINGS: CsvParseOptions['buildings'] = [
  { id: 'schumann', name: 'Schumann Elementary' },
  { id: 'intermediate', name: 'Intermediate School' },
  { id: 'middle', name: 'Middle School' },
  { id: 'high', name: 'High School' },
];

const baseOptions: CsvParseOptions = { roles: ROLES, buildings: BUILDINGS };

describe('parseInvitesCsv', () => {
  it('parses a happy-path CSV with 3 valid rows', () => {
    const csv = [
      'name,email,role,building',
      'Alice,alice@orono.k12.mn.us,Teacher,Schumann Elementary',
      'Bob,bob@orono.k12.mn.us,Building Admin,Middle School',
      'Carol,carol@orono.k12.mn.us,Domain Admin,High School',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      {
        name: 'Alice',
        email: 'alice@orono.k12.mn.us',
        roleId: 'teacher',
        buildingIds: ['schumann'],
      },
      {
        name: 'Bob',
        email: 'bob@orono.k12.mn.us',
        roleId: 'building_admin',
        buildingIds: ['middle'],
      },
      {
        name: 'Carol',
        email: 'carol@orono.k12.mn.us',
        roleId: 'domain_admin',
        buildingIds: ['high'],
      },
    ]);
  });

  it('returns a single error when the email column is missing', () => {
    const csv = 'name,role,building\nAlice,Teacher,Schumann Elementary';
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([
      {
        line: 1,
        raw: 'name,role,building',
        reason: 'CSV must include an "email" column.',
      },
    ]);
  });

  it('flags rows with invalid email formats (per-row error, not whole-file)', () => {
    const csv = [
      'name,email',
      'Good,ok@orono.k12.mn.us',
      'Bad1,not-an-email',
      'Bad2,also@bad',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]?.email).toBe('ok@orono.k12.mn.us');
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]?.line).toBe(3);
    expect(result.errors[0]?.reason).toContain('Invalid email');
    expect(result.errors[1]?.line).toBe(4);
    expect(result.errors[1]?.reason).toContain('Invalid email');
  });

  it('handles quoted fields with commas inside (RFC 4180)', () => {
    const csv = [
      'name,email,role,building',
      '"Ivers, Paul",paul@orono.k12.mn.us,Domain Admin,"High School"',
      '"O\'Neil, Jane",jane@orono.k12.mn.us,Teacher,"Schumann Elementary, Intermediate School"',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0]?.name).toBe('Ivers, Paul');
    expect(result.valid[0]?.buildingIds).toEqual(['high']);
    // Comma-separated tokens inside a quoted cell resolve to multiple buildings.
    expect(result.valid[1]?.name).toBe("O'Neil, Jane");
    expect(result.valid[1]?.buildingIds).toEqual(['schumann', 'intermediate']);
  });

  it('escapes doubled quotes inside quoted fields', () => {
    const csv = 'name,email\n"She said ""hi""",hi@orono.k12.mn.us';
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid[0]?.name).toBe('She said "hi"');
  });

  it('accepts CRLF line endings', () => {
    const csv =
      'name,email,role\r\nAlice,alice@orono.k12.mn.us,Teacher\r\nBob,bob@orono.k12.mn.us,Teacher\r\n';
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(2);
    expect(result.valid.map((i) => i.email)).toEqual([
      'alice@orono.k12.mn.us',
      'bob@orono.k12.mn.us',
    ]);
  });

  it('does not create phantom empty rows from trailing newlines', () => {
    const csv = 'name,email\nAlice,alice@orono.k12.mn.us\n\n\n';
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(1);
  });

  it('emits a per-row error for an unknown role', () => {
    const csv = [
      'name,email,role',
      'Alice,alice@orono.k12.mn.us,Teacher',
      'Bob,bob@orono.k12.mn.us,Overlord',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]?.email).toBe('alice@orono.k12.mn.us');
    expect(result.errors).toEqual([
      {
        line: 3,
        raw: 'Bob,bob@orono.k12.mn.us,Overlord',
        reason: 'Unknown role "Overlord".',
      },
    ]);
  });

  it('resolves custom (non-system) roles by name', () => {
    const csv =
      'email,role\nalice@orono.k12.mn.us,Specialist\nbob@orono.k12.mn.us,custom_role_xyz';
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid.map((i) => i.roleId)).toEqual([
      'custom_role_xyz',
      'custom_role_xyz',
    ]);
  });

  it('uses defaultRoleId when the role cell is empty or missing', () => {
    const csv = [
      'name,email,role',
      'Alice,alice@orono.k12.mn.us,',
      'Bob,bob@orono.k12.mn.us,Teacher',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid[0]?.roleId).toBe('teacher'); // default
    expect(result.valid[1]?.roleId).toBe('teacher');
  });

  it('rejects rows when any building token fails to resolve (no partial)', () => {
    const csv = [
      'name,email,role,building',
      // Two tokens, one unknown: row must be rejected with a clear reason.
      'Alice,alice@orono.k12.mn.us,Teacher,"Schumann Elementary, Ghost Campus"',
      'Bob,bob@orono.k12.mn.us,Teacher,Middle School',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]?.email).toBe('bob@orono.k12.mn.us');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.line).toBe(2);
    expect(result.errors[0]?.reason).toContain('Ghost Campus');
  });

  it('accepts both "," and ";" as building delimiters', () => {
    const csv = [
      'email,building',
      'alice@orono.k12.mn.us,"Schumann Elementary; Intermediate School"',
      'bob@orono.k12.mn.us,"Middle School, High School"',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid[0]?.buildingIds).toEqual(['schumann', 'intermediate']);
    expect(result.valid[1]?.buildingIds).toEqual(['middle', 'high']);
  });

  it('resolves buildings by id as well as name, case-insensitively', () => {
    const csv = [
      'email,building',
      'alice@orono.k12.mn.us,schumann',
      'bob@orono.k12.mn.us,HIGH SCHOOL',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid[0]?.buildingIds).toEqual(['schumann']);
    expect(result.valid[1]?.buildingIds).toEqual(['high']);
  });

  it('deduplicates on email — later row wins, earlier row emits an error', () => {
    const csv = [
      'name,email,role',
      'Alice V1,alice@orono.k12.mn.us,Teacher',
      'Carol,carol@orono.k12.mn.us,Teacher',
      'Alice V2,ALICE@orono.k12.mn.us,Domain Admin',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    // `valid` has the later Alice and Carol; the earlier Alice is dropped.
    expect(result.valid).toHaveLength(2);
    const aliceEntry = result.valid.find(
      (i) => i.email === 'alice@orono.k12.mn.us'
    );
    expect(aliceEntry?.name).toBe('Alice V2');
    expect(aliceEntry?.roleId).toBe('domain_admin');
    // Error attached to the earlier row's line number.
    expect(result.errors).toEqual([
      {
        line: 2,
        raw: 'Alice V1,alice@orono.k12.mn.us,Teacher',
        reason: 'Duplicate email; later row supersedes this one.',
      },
    ]);
  });

  it('short-circuits when data rows exceed maxRows', () => {
    const header = 'email';
    const rows = Array.from(
      { length: 6 },
      (_, i) => `user${i}@orono.k12.mn.us`
    );
    const csv = [header, ...rows].join('\n');
    const result = parseInvitesCsv(csv, { ...baseOptions, maxRows: 5 });
    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([
      {
        line: 0,
        raw: '',
        reason: 'CSV exceeds maxRows (5). Split into multiple imports.',
      },
    ]);
  });

  it('returns empty result for a header-only CSV', () => {
    const result = parseInvitesCsv('name,email,role,building', baseOptions);
    expect(result).toEqual({ valid: [], errors: [] });
  });

  it('returns a single "empty" error for blank input', () => {
    const result = parseInvitesCsv('', baseOptions);
    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([
      { line: 0, raw: '', reason: 'CSV is empty.' },
    ]);
  });

  it('treats whitespace-only input as empty', () => {
    const result = parseInvitesCsv('   \n\r\n  \t', baseOptions);
    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([
      { line: 0, raw: '', reason: 'CSV is empty.' },
    ]);
  });

  it('produces both valid and errors for a mixed CSV', () => {
    const csv = [
      'name,email,role,building',
      'Alice,alice@orono.k12.mn.us,Teacher,Schumann Elementary',
      'Bob,not-an-email,Teacher,Middle School',
      'Carol,carol@orono.k12.mn.us,NotARole,High School',
      'Dave,dave@orono.k12.mn.us,Teacher,"High School, Ghost Campus"',
      'Eve,eve@orono.k12.mn.us,Teacher,Middle School',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.valid.map((i) => i.email)).toEqual([
      'alice@orono.k12.mn.us',
      'eve@orono.k12.mn.us',
    ]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });

  it('ignores unknown columns (e.g. "message") without erroring', () => {
    const csv = [
      'name,email,role,message',
      'Alice,alice@orono.k12.mn.us,Teacher,Welcome aboard!',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid).toEqual([
      {
        name: 'Alice',
        email: 'alice@orono.k12.mn.us',
        roleId: 'teacher',
        buildingIds: [],
      },
    ]);
  });

  it('supports columns in any order', () => {
    const csv = [
      'role,email,building,name',
      'Teacher,alice@orono.k12.mn.us,Schumann Elementary,Alice',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid[0]).toEqual({
      name: 'Alice',
      email: 'alice@orono.k12.mn.us',
      roleId: 'teacher',
      buildingIds: ['schumann'],
    });
  });

  it('emits a per-row error for a missing email cell', () => {
    const csv = [
      'name,email,role',
      'Nameless,,Teacher',
      'Alice,alice@orono.k12.mn.us,Teacher',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      line: 2,
      reason: 'Missing email.',
    });
  });

  it('lowercases the stored email even when input is mixed case', () => {
    const csv = 'email\nAlice@Orono.K12.MN.US';
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid[0]?.email).toBe('alice@orono.k12.mn.us');
  });

  it('deduplicates repeated building tokens within a single cell', () => {
    const csv = [
      'email,building',
      'alice@orono.k12.mn.us,"Schumann Elementary, Schumann Elementary, schumann"',
    ].join('\n');
    const result = parseInvitesCsv(csv, baseOptions);
    expect(result.errors).toEqual([]);
    expect(result.valid[0]?.buildingIds).toEqual(['schumann']);
  });
});
