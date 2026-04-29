import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  QuizDriveService,
  PlcSheetMissingError,
} from '@/utils/quizDriveService';

/**
 * Mock helper: enqueues `fetch` responses in order so the tests can
 * simulate Drive/Sheets multi-call flows (e.g. create sheet, then grant
 * permission) without maintaining an elaborate scripted double.
 */
type FetchSpy = ReturnType<typeof vi.spyOn>;

function queueFetchResponses(
  responses: Array<{
    ok?: boolean;
    status?: number;
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  }>
): FetchSpy {
  const spy = vi.spyOn(global, 'fetch');
  for (const r of responses) {
    spy.mockResolvedValueOnce({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      statusText: '',
      json: r.json ?? (() => Promise.resolve({})),
      text: r.text ?? (() => Promise.resolve('')),
      headers: new Headers(),
    } as Response);
  }
  return spy;
}

/** Safely decode a fetch call's JSON body. */
function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  if (!init || typeof init.body !== 'string') return {};
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('QuizDriveService.createPlcSheetAndShare', () => {
  const token = 'test-token';
  let service: QuizDriveService;

  beforeEach(() => {
    service = new QuizDriveService(token);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a new sheet and grants writer permission to every teammate email', async () => {
    const fetchSpy = queueFetchResponses([
      // 1. POST /spreadsheets — create the sheet
      {
        json: () =>
          Promise.resolve({
            spreadsheetId: 'sheet-abc',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-abc',
          }),
      },
      // 2. POST /files/sheet-abc/permissions — grant teacher-b
      { json: () => Promise.resolve({ id: 'perm-1' }) },
      // 3. POST /files/sheet-abc/permissions — grant teacher-c
      { json: () => Promise.resolve({ id: 'perm-2' }) },
    ]);

    const result = await service.createPlcSheetAndShare({
      plcName: '6th Grade Math',
      quizTitle: 'Unit 3 Check',
      memberEmailsToShareWith: [
        'teacher.b@example.org',
        'TEACHER.C@example.org',
      ],
    });

    expect(result).toEqual({
      url: 'https://docs.google.com/spreadsheets/d/sheet-abc',
      spreadsheetId: 'sheet-abc',
    });

    // First call = create sheet with the PLC-titled spreadsheet body.
    // `fetchSpy.mock.calls` is typed as `any` through the vi.spyOn return,
    // so we coerce once into the shape we care about.
    const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls as Array<[string, RequestInit]>;
    const [createUrl, createInit] = calls[0];
    expect(createUrl).toBe('https://sheets.googleapis.com/v4/spreadsheets');
    const createBody = parseBody(createInit);
    const properties = createBody.properties as { title?: unknown };
    expect(properties.title).toBe('6th Grade Math – Unit 3 Check – Results');
    const sheetsArr = createBody.sheets as Array<{
      properties?: { title?: unknown };
    }>;
    expect(sheetsArr[0].properties?.title).toBe('Results');

    // Remaining calls = permission grants, normalized to lowercase, with
    // sendNotificationEmail=false so Drive doesn't spam a separate email.
    const permCalls = calls.slice(1);
    expect(permCalls).toHaveLength(2);
    for (const [url, init] of permCalls) {
      expect(url).toContain('/files/sheet-abc/permissions');
      expect(url).toContain('sendNotificationEmail=false');
      const body = parseBody(init);
      expect(body.role).toBe('writer');
      expect(body.type).toBe('user');
      expect(body.emailAddress as string).toMatch(
        /^teacher\.(b|c)@example\.org$/
      );
    }
  });

  it('continues and returns the URL even when a single grant fails', async () => {
    queueFetchResponses([
      // Create succeeds
      {
        json: () =>
          Promise.resolve({
            spreadsheetId: 'sheet-xyz',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-xyz',
          }),
      },
      // First grant fails — e.g. stale email outside the org
      {
        ok: false,
        status: 400,
        text: () => Promise.resolve('invalid email'),
      },
      // Second grant succeeds
      { json: () => Promise.resolve({ id: 'perm-2' }) },
    ]);

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* suppress */
    });
    const result = await service.createPlcSheetAndShare({
      plcName: 'My PLC',
      quizTitle: 'Quiz 1',
      memberEmailsToShareWith: ['bogus@nope', 'ok@example.org'],
    });
    errSpy.mockRestore();

    expect(result.spreadsheetId).toBe('sheet-xyz');
  });

  it('throws a friendly error when Sheets scope is missing (401/403 on create)', async () => {
    queueFetchResponses([
      {
        ok: false,
        status: 403,
        text: () => Promise.resolve('insufficient scope'),
      },
    ]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* suppress */
    });
    await expect(
      service.createPlcSheetAndShare({
        plcName: 'X',
        quizTitle: 'Y',
        memberEmailsToShareWith: [],
      })
    ).rejects.toThrow(/Google Sheets access is not granted/);
    errSpy.mockRestore();
  });

  it('dedupes member emails and skips empty / invalid entries', async () => {
    const fetchSpy = queueFetchResponses([
      {
        json: () =>
          Promise.resolve({
            spreadsheetId: 'sheet-dedupe',
            spreadsheetUrl:
              'https://docs.google.com/spreadsheets/d/sheet-dedupe',
          }),
      },
      { json: () => Promise.resolve({ id: 'perm-1' }) },
    ]);

    await service.createPlcSheetAndShare({
      plcName: 'D',
      quizTitle: 'Q',
      memberEmailsToShareWith: [
        'dupe@example.org',
        'DUPE@example.org',
        '',
        '   ',
        'no-at-sign',
      ],
    });

    // Create + exactly ONE permission grant (dupe collapsed).
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('QuizDriveService.reconcilePlcSheetPermissions', () => {
  const token = 'test-token';
  let service: QuizDriveService;

  beforeEach(() => {
    service = new QuizDriveService(token);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('grants writer to teammates missing from the current permission list', async () => {
    const fetchSpy = queueFetchResponses([
      // LIST existing permissions — teacher-a already has access, teacher-c does not
      {
        json: () =>
          Promise.resolve({
            permissions: [
              {
                id: 'p1',
                type: 'user',
                role: 'owner',
                emailAddress: 'owner@example.org',
              },
              {
                id: 'p2',
                type: 'user',
                role: 'writer',
                emailAddress: 'teacher-a@example.org',
              },
            ],
          }),
      },
      // GRANT teacher-c
      { json: () => Promise.resolve({ id: 'perm-new' }) },
    ]);

    const result = await service.reconcilePlcSheetPermissions({
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-123/edit',
      memberEmailsToShareWith: [
        'teacher-a@example.org',
        'teacher-c@example.org',
      ],
    });

    expect(result.granted).toEqual(['teacher-c@example.org']);
    expect(result.skipped).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns skipped=true without throwing when the caller cannot list permissions (403)', async () => {
    queueFetchResponses([
      { ok: false, status: 403, text: () => Promise.resolve('forbidden') },
    ]);
    const result = await service.reconcilePlcSheetPermissions({
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-xyz/edit',
      memberEmailsToShareWith: ['anyone@example.org'],
    });
    expect(result).toEqual({ granted: [], skipped: true });
  });

  it('returns skipped=true on 404 (sheet deleted in Drive)', async () => {
    queueFetchResponses([
      { ok: false, status: 404, text: () => Promise.resolve('not found') },
    ]);
    const result = await service.reconcilePlcSheetPermissions({
      sheetUrl: 'https://docs.google.com/spreadsheets/d/gone/edit',
      memberEmailsToShareWith: ['anyone@example.org'],
    });
    expect(result.skipped).toBe(true);
  });

  it('returns skipped=true for malformed sheet URLs without calling fetch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await service.reconcilePlcSheetPermissions({
      sheetUrl: 'not-a-sheet-url',
      memberEmailsToShareWith: ['x@example.org'],
    });
    expect(result).toEqual({ granted: [], skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when no teammates need access', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await service.reconcilePlcSheetPermissions({
      sheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
      memberEmailsToShareWith: [],
    });
    expect(result).toEqual({ granted: [], skipped: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('QuizDriveService appendToExistingSheet error surfacing', () => {
  const token = 'test-token';
  let service: QuizDriveService;

  beforeEach(() => {
    service = new QuizDriveService(token);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws PlcSheetMissingError when the sheet is gone (404)', async () => {
    queueFetchResponses([
      // Title metadata lookup — succeeds with a default tab name
      {
        json: () =>
          Promise.resolve({
            sheets: [{ properties: { title: 'Results' } }],
          }),
      },
      // A1 existence check — 404 Not Found
      { ok: false, status: 404, text: () => Promise.resolve('gone') },
    ]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* suppress */
    });
    await expect(
      service.exportResultsToSheet('Q', [], [], {
        plcMode: true,
        plcSheetUrl: 'https://docs.google.com/spreadsheets/d/gone/edit',
      })
    ).rejects.toBeInstanceOf(PlcSheetMissingError);
    errSpy.mockRestore();
  });

  it('throws PlcSheetMissingError when the caller lost access (403)', async () => {
    queueFetchResponses([
      {
        json: () =>
          Promise.resolve({
            sheets: [{ properties: { title: 'Results' } }],
          }),
      },
      {
        ok: false,
        status: 403,
        text: () => Promise.resolve('forbidden'),
      },
    ]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* suppress */
    });
    await expect(
      service.exportResultsToSheet('Q', [], [], {
        plcMode: true,
        plcSheetUrl: 'https://docs.google.com/spreadsheets/d/locked/edit',
      })
    ).rejects.toBeInstanceOf(PlcSheetMissingError);
    errSpy.mockRestore();
  });
});
