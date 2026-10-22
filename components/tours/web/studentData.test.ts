import { describe, expect, it } from 'vitest';
import { buildNameMatcher } from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import {
  findPageBlurSpans,
  findStudentData,
  isHardHit,
  MAX_CAPTURED_TEXT,
  REDACTED,
  redactStudentData,
  scrubCapturedText,
  MAX_HREF_PATTERN,
  toHrefPattern,
  toUrlPattern,
} from './studentData';

const roster = buildNameMatcher([
  { firstName: 'Alice', lastName: 'Nguyen' },
  { firstName: 'Marcus', lastName: 'Bell' },
]);

const kinds = (text: string, matcher = roster) =>
  findStudentData(text, matcher).map((h) => [
    h.kind,
    text.slice(h.start, h.end),
  ]);

describe('findStudentData', () => {
  it('catches roster names, emails, student numbers and uuids', () => {
    expect(kinds('Open Alice Nguyen')).toEqual([
      ['roster-name', 'Alice Nguyen'],
    ]);
    expect(kinds('Email abell27@students.orono.k12.mn.us')).toEqual([
      ['email', 'abell27@students.orono.k12.mn.us'],
    ]);
    expect(kinds('Student #2045831')).toEqual([['id-number', '2045831']]);
    expect(kinds('Call 952 449 8300')).toEqual([['id-number', '952 449 8300']]);
    expect(kinds('row 3f2b1c9a-1d2e-4f5a-9b8c-0a1b2c3d4e5f')).toEqual([
      ['uuid', '3f2b1c9a-1d2e-4f5a-9b8c-0a1b2c3d4e5f'],
    ]);
  });

  it('flags a Last, First name not on any roster as a possible name', () => {
    const hits = findStudentData('Grades for Ortiz, Jamal', roster);
    expect(hits.map((h) => h.kind)).toEqual(['possible-name']);
    expect(hits.every(isHardHit)).toBe(false);
  });

  it('keeps the hard kind where a possible name is also a roster name', () => {
    expect(kinds('Nguyen, Alice')).toEqual([['roster-name', 'Nguyen, Alice']]);
  });

  it('leaves ordinary interface text alone', () => {
    for (const text of [
      'Gradebook',
      'Save and close',
      'Quarter 2 2026',
      'Period 3',
      'Add assignment',
    ])
      expect(findStudentData(text, roster)).toEqual([]);
  });

  it('catches roster names run together in ids and addresses', () => {
    expect(kinds('#studentAliceNguyen > a')).toEqual([
      ['roster-name', 'studentAliceNguyen'],
    ]);
    expect(kinds('https://x.example/students/alice_nguyen')).toEqual([
      ['roster-name', 'alice_nguyen'],
    ]);
    expect(kinds('#main-nav > a')).toEqual([]);
  });

  it('works without a roster', () => {
    expect(kinds('Alice Nguyen 1234567', null)).toEqual([
      ['id-number', '1234567'],
    ]);
  });
});

describe('redactStudentData', () => {
  it('replaces every hit, or only the hard ones', () => {
    const text = 'Ortiz, Jamal 1234567';
    const hits = findStudentData(text, null);
    expect(redactStudentData(text, hits)).toBe(`${REDACTED} ${REDACTED}`);
    expect(redactStudentData(text, hits, 'hard')).toBe(
      `Ortiz, Jamal ${REDACTED}`
    );
  });
});

describe('scrubCapturedText', () => {
  it('collapses spaces, cuts long text and removes emails and ids', () => {
    expect(scrubCapturedText('  Grade\n\n  a@b.org  ')).toBe(
      `Grade ${REDACTED}`
    );
    expect(scrubCapturedText('x'.repeat(500))).toHaveLength(MAX_CAPTURED_TEXT);
    // A cut never leaves part of an email or number.
    const long = `${'x'.repeat(104)} jane.smith@orono.k12.mn.us 1234567`;
    expect(scrubCapturedText(long)).toBe(
      `${'x'.repeat(104)} ${REDACTED} ${REDACTED}`
    );
    expect(scrubCapturedText(`${'word '.repeat(23)}abcdefgh`)).toBe(
      'word '.repeat(23).trim()
    );
    expect(scrubCapturedText(null)).toBe('');
  });
});

describe('toUrlPattern', () => {
  it('turns ids, digit runs and query values into wildcards', () => {
    expect(
      toUrlPattern(
        'https://orono.infinitecampus.org/campus/student/2045831/grades?personID=88123&tab=1#top'
      )
    ).toBe(
      'https://orono.infinitecampus.org/campus/student/*/grades?personID=*&tab=*'
    );
    expect(
      toUrlPattern(
        'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit'
      )
    ).toBe('https://docs.google.com/document/d/*/edit');
    expect(
      toUrlPattern(
        'https://app.example.com/items/3f2b1c9a-1d2e-4f5a-9b8c-0a1b2c3d4e5f'
      )
    ).toBe('https://app.example.com/items/*');
  });

  it('wildcards an email in the path and ids in a hash route', () => {
    expect(
      toUrlPattern('https://x.example/users/a.b%40orono.k12.mn.us/profile')
    ).toBe('https://x.example/users/*/profile');
    expect(toUrlPattern('https://x.example/app#/students/55123/notes')).toBe(
      'https://x.example/app#/students/*/notes'
    );
  });

  it('keeps plain words and short numbers', () => {
    expect(toUrlPattern('https://classroom.google.com/u/0/h')).toBe(
      'https://classroom.google.com/u/0/h'
    );
    expect(toUrlPattern('https://orono.schoology.com/home')).toBe(
      'https://orono.schoology.com/home'
    );
  });

  it('refuses non-web pages', () => {
    expect(toUrlPattern('chrome://settings')).toBeNull();
    expect(toUrlPattern('not a url')).toBeNull();
  });
});

describe('toHrefPattern', () => {
  it('keeps the path with ids as *, and the origin only for another site', () => {
    const page = 'https://orono.schoology.com/home';
    expect(toHrefPattern('/course/7712345678/materials?f=1', page)).toBe(
      '/course/*/materials'
    );
    expect(toHrefPattern('https://docs.google.com/a/b', page)).toBe(
      'https://docs.google.com/a/b'
    );
    expect(toHrefPattern('javascript:void(0)', page)).toBeNull();
  });

  it('drops a pattern past the cap, origin included, so the click still records', () => {
    const page = 'https://orono.schoology.com/home';
    const path = '/' + 'a'.repeat(MAX_HREF_PATTERN - 10);
    expect(toHrefPattern(path, page)).toBe(path);
    const far = `https://sharepoint.example.com${path}`;
    expect(toHrefPattern(far, page)).toBeNull();
    // The page-side re-scrub of a stored pattern uses the same cap.
    expect(toHrefPattern(far)).toBeNull();
  });
});

describe('findPageBlurSpans', () => {
  const ALL = { emails: true, ids: true, lastFirst: true };
  const spans = (text: string, patterns = ALL) =>
    findPageBlurSpans(text, patterns).map((s) => text.slice(s.start, s.end));

  it('finds emails', () => {
    expect(spans('Mail jane.smith@orono.k12.mn.us today')).toEqual([
      'jane.smith@orono.k12.mn.us',
    ]);
  });

  it('finds student ids, phone numbers and uuids', () => {
    expect(spans('ID 4501234, call (952) 449-8300')).toEqual([
      '4501234',
      '(952) 449-8300',
    ]);
    expect(spans('Row 1b4e28ba-2fa1-11d2-883f-0016d3cca427')).toEqual([
      '1b4e28ba-2fa1-11d2-883f-0016d3cca427',
    ]);
  });

  it('finds names written Last, First', () => {
    expect(spans('Smith, Jane')).toEqual(['Smith, Jane']);
    expect(spans('Van Buren, Martin J.')).toEqual(['Van Buren, Martin J.']);
  });

  it('finds names whose words are also months, places or common words', () => {
    for (const name of [
      'West, April',
      'Day, Summer',
      'Washington, Mary',
      'Smith, May',
      'Hall, Art',
      'North, Grace',
    ])
      expect(spans(name)).toEqual([name]);
  });

  it('finds Mc, O’, Le and all-caps names', () => {
    for (const name of [
      'McDonald, Ava',
      "O'Brien, Liam",
      'LeBlanc, Mia',
      'SMITH, JOHN',
      'Smith, DeShawn',
    ])
      expect(spans(name)).toEqual([name]);
  });

  it('keeps the possible-name warning as narrow as before', () => {
    expect(findStudentData('McDonald, Ava', null)).toEqual([]);
    expect(findStudentData('SMITH, JOHN', null)).toEqual([]);
  });

  it('leaves dates, prices and times alone', () => {
    for (const text of [
      'Due October 22, 2026',
      '10/22/2026 at 10:30',
      '2026-10-22',
      'Total $1,250.00',
      'Only $45.99',
      'Grade 9, Period 3',
    ])
      expect(spans(text)).toEqual([]);
  });

  it('leaves ordinary capitalised phrases alone', () => {
    for (const text of [
      'Hello, World',
      'Monday, October',
      'Thanks, Everyone',
      'Settings, Help',
      'Orono, Minnesota',
      'However, Students',
      'Spring, Summer',
      'HOME, HELP',
      'Paris, France',
      'Best, Regards',
    ])
      expect(spans(text)).toEqual([]);
  });

  it('only finds the patterns switched on', () => {
    const text = 'Smith, Jane jane@school.org 4501234';
    const only = (on: 'emails' | 'ids' | 'lastFirst') =>
      spans(text, {
        emails: on === 'emails',
        ids: on === 'ids',
        lastFirst: on === 'lastFirst',
      });
    expect(only('emails')).toEqual(['jane@school.org']);
    expect(only('ids')).toEqual(['4501234']);
    expect(only('lastFirst')).toEqual(['Smith, Jane']);
    expect(
      spans(text, { emails: false, ids: false, lastFirst: false })
    ).toEqual([]);
  });

  it('merges overlapping matches', () => {
    expect(findPageBlurSpans('12345@school.org', ALL)).toEqual([
      { start: 0, end: 16 },
    ]);
  });
});
