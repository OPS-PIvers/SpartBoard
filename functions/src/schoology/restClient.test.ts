import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createGradingCategories,
  getColumnCategory,
  isSchoologyApiUrl,
  listColumnGrades,
  listEnrollments,
  listGradingCategories,
  schoologyOAuthHeader,
  schoologyUidFromSub,
  setColumnCategory,
  setExceptions,
  SchoologyRestError,
  SCHOOLOGY_EXCEPTION,
} from './restClient';

const CREDS = { consumerKey: 'key123', consumerSecret: 's3cr&t' };
const SECTION = '7660186912';
const API = 'https://api.schoology.com/v1';

type FetchArgs = [string, RequestInit | undefined];

function stubFetch(...responses: Response[]) {
  const fn = vi.fn<(...args: FetchArgs) => Promise<Response>>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const bodyOf = (call: FetchArgs): unknown =>
  JSON.parse(call[1]?.body as string);

afterEach(() => vi.unstubAllGlobals());

describe('schoologyOAuthHeader', () => {
  it('signs PLAINTEXT with the encoded secret and an empty token secret', () => {
    const h = schoologyOAuthHeader(CREDS, 'nonce1', 1700000000);
    expect(h).toBe(
      'OAuth realm="Schoology API", oauth_consumer_key="key123", oauth_token="", ' +
        'oauth_nonce="nonce1", oauth_timestamp="1700000000", ' +
        'oauth_signature_method="PLAINTEXT", oauth_version="1.0", ' +
        'oauth_signature="s3cr%2526t%26"'
    );
  });
});

describe('isSchoologyApiUrl', () => {
  it.each([
    ['https://api.schoology.com/v1/sections/1', true],
    ['http://api.schoology.com/v1/sections/1', false],
    ['https://api.schoology.com.evil.test/v1', false],
    ['https://api.schoology.com:444/v1', false],
    ['https://u:p@api.schoology.com/v1', false],
    ['nope', false],
  ])('%s → %s', (url, ok) => {
    expect(isSchoologyApiUrl(url)).toBe(ok);
  });
});

describe('request handling', () => {
  it('follows a See Other on the same host as a GET', async () => {
    const fetchMock = stubFetch(
      new Response('', {
        status: 303,
        headers: {
          location: `${API}/sections/${SECTION}/grading_categories?x=1`,
        },
      }),
      json({ grading_category: [] })
    );
    await listGradingCategories(CREDS, SECTION);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${API}/sections/${SECTION}/grading_categories?x=1`
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe('GET');
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual');
  });

  it('refuses a redirect to another host', async () => {
    const fetchMock = stubFetch(
      new Response('', {
        status: 302,
        headers: { location: 'https://evil.test/steal' },
      })
    );
    await expect(listGradingCategories(CREDS, SECTION)).rejects.toBeInstanceOf(
      SchoologyRestError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws with the status on a failure', async () => {
    stubFetch(new Response('denied', { status: 403 }));
    await expect(listGradingCategories(CREDS, SECTION)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('rejects a non-numeric section id before any request', async () => {
    const fetchMock = stubFetch();
    await expect(
      listGradingCategories(CREDS, '../users/me')
    ).rejects.toBeInstanceOf(SchoologyRestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('grading categories', () => {
  it('lists categories with numeric weights', async () => {
    stubFetch(
      json({
        grading_category: [
          { id: 97896131, title: 'Academic Achievement', weight: '80' },
          { id: 'bad', title: 'skip' },
        ],
      })
    );
    await expect(listGradingCategories(CREDS, SECTION)).resolves.toEqual([
      { id: '97896131', title: 'Academic Achievement', weight: 80 },
    ]);
  });

  it('creates categories, then re-reads them', async () => {
    const fetchMock = stubFetch(
      json(
        {
          grading_category: [
            { id: '97896131', response_code: 200 },
            { id: '97896059', response_code: 200 },
          ],
        },
        207
      ),
      json({
        grading_category: [
          { id: 97896131, title: 'Academic Achievement', weight: 0 },
          { id: 97896059, title: 'Academic Practice', weight: 0 },
        ],
      })
    );
    const after = await createGradingCategories(CREDS, SECTION, [
      { title: 'Academic Achievement', weight: 80 },
      { title: 'Academic Practice', weight: 20 },
    ]);
    expect(after.map((c) => c.weight)).toEqual([0, 0]);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
      grading_categories: {
        grading_category: [
          { title: 'Academic Achievement', weight: 80, calculation_type: 2 },
          { title: 'Academic Practice', weight: 20, calculation_type: 2 },
        ],
      },
    });
  });

  it('throws when Schoology refuses a row', async () => {
    stubFetch(json({ grading_category: [{ response_code: 400 }] }, 207));
    await expect(
      createGradingCategories(CREDS, SECTION, [{ title: 'X', weight: 100 }])
    ).rejects.toBeInstanceOf(SchoologyRestError);
  });
});

describe('column category', () => {
  it('moves a column with a numeric category id', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));
    await setColumnCategory(CREDS, SECTION, '8604205395', '97895530');
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API}/sections/${SECTION}/assignments/8604205395`
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT');
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
      grading_category: 97895530,
    });
  });

  it('reads a column category across pages', async () => {
    stubFetch(
      json({
        assignment: [{ id: 1, grading_category: '5' }],
        links: { next: `${API}/sections/${SECTION}/grade_items?start=200` },
      }),
      json({ assignment: [{ id: 8604205395, grading_category: '0' }] })
    );
    await expect(getColumnCategory(CREDS, SECTION, '8604205395')).resolves.toBe(
      '0'
    );
  });

  it('returns null for a column that is gone', async () => {
    stubFetch(json({ assignment: [] }));
    await expect(getColumnCategory(CREDS, SECTION, '1')).resolves.toBeNull();
  });
});

describe('grades and exceptions', () => {
  it('reads cells with exceptions and blank grades', async () => {
    stubFetch(
      json({
        grades: {
          grade: [
            { enrollment_id: 11, grade: 8, exception: 0, comment: '' },
            { enrollment_id: 12, grade: null, exception: 3, comment: '' },
          ],
        },
      })
    );
    await expect(listColumnGrades(CREDS, SECTION, '99')).resolves.toEqual([
      { enrollmentId: '11', grade: 8, exception: 0, comment: '' },
      { enrollmentId: '12', grade: null, exception: 3, comment: '' },
    ]);
  });

  it('sets Missing and reports each row', async () => {
    const fetchMock = stubFetch(
      json(
        { grades: { grade: [{ response_code: 204 }, { response_code: 400 }] } },
        207
      )
    );
    const ok = await setExceptions(CREDS, SECTION, [
      {
        columnId: '99',
        enrollmentId: '11',
        exception: SCHOOLOGY_EXCEPTION.MISSING,
      },
      {
        columnId: '99',
        enrollmentId: '12',
        exception: SCHOOLOGY_EXCEPTION.MISSING,
      },
    ]);
    expect(ok).toEqual([true, false]);
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({
      grades: {
        grade: [
          {
            type: 'assignment',
            assignment_id: 99,
            enrollment_id: 11,
            exception: 3,
          },
          {
            type: 'assignment',
            assignment_id: 99,
            enrollment_id: 12,
            exception: 3,
          },
        ],
      },
    });
  });

  it('sends nothing for no rows', async () => {
    const fetchMock = stubFetch();
    await expect(setExceptions(CREDS, SECTION, [])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('enrollments', () => {
  it('maps enrollments and flags teachers', async () => {
    stubFetch(
      json({
        enrollment: [
          { id: 3316583281, uid: '110229', admin: 0 },
          { id: 3316583282, uid: '7', admin: '1' },
          { id: 3, uid: '' },
        ],
      })
    );
    await expect(listEnrollments(CREDS, SECTION)).resolves.toEqual([
      { enrollmentId: '3316583281', uid: '110229', isAdmin: false },
      { enrollmentId: '3316583282', uid: '7', isAdmin: true },
    ]);
  });
});

describe('schoologyUidFromSub', () => {
  it.each([
    ['110229::0f3a9c', '110229'],
    ['abc::0f3a9c', null],
    ['110229', null],
    ['::x', null],
  ])('%s → %s', (sub, uid) => {
    expect(schoologyUidFromSub(sub)).toBe(uid);
  });
});
