/**
 * Tests for the PLC rubric library (M12 Phase 3-I): the snapshot parser's
 * malformed-doc defense, the attribution strip used by import-from-PLC, and
 * the three share paths (create / revive a tombstone / already shared) whose
 * write payloads must stay inside what `/plcs/{plcId}/rubrics` rules allow.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  parsePlcRubricEntry,
  toPortableRubric,
  writePlcRubricEntry,
} from '@/hooks/usePlcRubrics';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import type { PlcRubricEntry, Rubric } from '@/types';

const DELETE_FIELD = { __deleteField: true };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteField: vi.fn(() => DELETE_FIELD),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const validDoc = () => ({
  id: 'rubric-1',
  title: 'Lab Report',
  description: 'Shared scoring guide',
  criteria: [
    {
      id: 'c1',
      name: 'Thesis',
      description: 'Claim quality',
      levels: [
        { id: 'l1', label: 'Low', points: 1 },
        { id: 'l2', label: 'High', points: 4, description: 'Clear claim' },
      ],
    },
  ],
  createdAt: 100,
  updatedAt: 200,
  sharedBy: 'teacher-2',
  sharedByEmail: 'smith@example.com',
  sharedByName: 'Mrs. Smith',
  sharedAt: 150,
});

describe('parsePlcRubricEntry', () => {
  it('parses a well-formed doc and preserves optional fields', () => {
    const entry = parsePlcRubricEntry('rubric-1', validDoc());
    expect(entry).not.toBeNull();
    expect(entry?.title).toBe('Lab Report');
    expect(entry?.description).toBe('Shared scoring guide');
    expect(entry?.criteria[0].levels[1].description).toBe('Clear claim');
    expect(entry?.sharedByName).toBe('Mrs. Smith');
    expect(rubricMaxPoints(entry as PlcRubricEntry)).toBe(4);
  });

  it('uses the doc id, not any id field on the payload', () => {
    const entry = parsePlcRubricEntry('doc-id', validDoc());
    expect(entry?.id).toBe('doc-id');
  });

  it('preserves a deletedAt tombstone', () => {
    const entry = parsePlcRubricEntry('rubric-1', {
      ...validDoc(),
      deletedAt: 999,
    });
    expect(entry?.deletedAt).toBe(999);
  });

  it.each([
    ['missing title', { title: undefined }],
    ['missing attribution', { sharedBy: undefined }],
    ['missing sharedAt', { sharedAt: undefined }],
    ['criteria not an array', { criteria: 'nope' }],
    ['criterion missing levels', { criteria: [{ id: 'c1', name: 'X' }] }],
    [
      'level missing points',
      {
        criteria: [
          { id: 'c1', name: 'X', levels: [{ id: 'l1', label: 'Low' }] },
        ],
      },
    ],
  ])('rejects a doc with %s', (_label, patch) => {
    expect(
      parsePlcRubricEntry('rubric-1', { ...validDoc(), ...patch })
    ).toBeNull();
  });

  it('defaults missing attribution display fields to empty strings', () => {
    const raw = validDoc() as Record<string, unknown>;
    delete raw.sharedByName;
    delete raw.sharedByEmail;
    const entry = parsePlcRubricEntry('rubric-1', raw);
    expect(entry?.sharedByName).toBe('');
    expect(entry?.sharedByEmail).toBe('');
  });
});

describe('toPortableRubric', () => {
  it('strips PLC attribution and tombstone fields', () => {
    const entry = parsePlcRubricEntry('rubric-1', {
      ...validDoc(),
      deletedAt: 5,
    }) as PlcRubricEntry;
    const portable = toPortableRubric(entry);
    expect(Object.keys(portable).sort()).toEqual([
      'createdAt',
      'criteria',
      'description',
      'id',
      'title',
      'updatedAt',
    ]);
  });

  it('omits description when the source has none', () => {
    const raw = validDoc() as Record<string, unknown>;
    delete raw.description;
    const entry = parsePlcRubricEntry('rubric-1', raw) as PlcRubricEntry;
    expect('description' in toPortableRubric(entry)).toBe(false);
  });
});

describe('writePlcRubricEntry', () => {
  const mockDoc = doc as Mock;
  const mockGetDoc = getDoc as Mock;
  const mockSetDoc = setDoc as Mock;
  const mockUpdateDoc = updateDoc as Mock;

  const PLC_ID = 'plc-1';
  const UID = 'teacher-1';
  const DOC_PATH = `plcs/${PLC_ID}/rubrics/rubric-1`;

  const rubric: Rubric = {
    id: 'rubric-1',
    title: 'Lab Report',
    description: 'Shared scoring guide',
    criteria: [
      {
        id: 'c1',
        name: 'Thesis',
        levels: [{ id: 'l1', label: 'High', points: 4 }],
      },
    ],
    createdAt: 100,
    updatedAt: 200,
  };

  const input = {
    rubric,
    sharedByName: 'Ms. Teacher',
    sharedByEmail: 't@example.com',
  };

  const snapshot = (data: Record<string, unknown> | null) => ({
    exists: () => data !== null,
    data: () => data,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (deleteField as Mock).mockReturnValue(DELETE_FIELD);
    mockDoc.mockImplementation((_db: unknown, ...segs: string[]) =>
      segs.join('/')
    );
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
  });

  it('creates a new entry with attribution when no doc exists', async () => {
    mockGetDoc.mockResolvedValue(snapshot(null));
    const outcome = await writePlcRubricEntry(PLC_ID, UID, input);

    expect(outcome).toBe('created');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = mockSetDoc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(ref).toBe(DOC_PATH);
    expect(payload.id).toBe('rubric-1');
    expect(payload.sharedBy).toBe(UID);
    expect(payload.sharedByEmail).toBe('t@example.com');
    expect(payload.sharedByName).toBe('Ms. Teacher');
    expect(payload.createdAt).toBe(100);
    expect(payload.sharedAt).toBe(payload.updatedAt);
    expect(payload.description).toBe('Shared scoring guide');
    // Rules reject unknown keys and Firestore rejects undefined values.
    expect(Object.keys(payload).sort()).toEqual([
      'createdAt',
      'criteria',
      'description',
      'id',
      'sharedAt',
      'sharedBy',
      'sharedByEmail',
      'sharedByName',
      'title',
      'updatedAt',
    ]);
    expect(Object.values(payload).some((v) => v === undefined)).toBe(false);
  });

  it('omits description from the create payload when the rubric has none', async () => {
    mockGetDoc.mockResolvedValue(snapshot(null));
    const { description: _drop, ...noDescription } = rubric;
    await writePlcRubricEntry(PLC_ID, UID, {
      ...input,
      rubric: noDescription,
    });
    const payload = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect('description' in payload).toBe(false);
  });

  it('revives a tombstoned entry with a content-only update', async () => {
    mockGetDoc.mockResolvedValue(
      snapshot({
        id: 'rubric-1',
        title: 'Old Title',
        criteria: [],
        createdAt: 100,
        updatedAt: 500,
        sharedBy: 'teacher-2',
        sharedByEmail: 'other@example.com',
        sharedByName: 'Mr. Other',
        sharedAt: 400,
        deletedAt: 900,
      })
    );
    const outcome = await writePlcRubricEntry(PLC_ID, UID, input);

    expect(outcome).toBe('restored');
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = mockUpdateDoc.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(ref).toBe(DOC_PATH);
    // Rules freeze identity + attribution after create — none may be written.
    expect(Object.keys(payload).sort()).toEqual([
      'criteria',
      'deletedAt',
      'description',
      'title',
      'updatedAt',
    ]);
    expect(payload.title).toBe('Lab Report');
    expect(payload.criteria).toEqual(rubric.criteria);
    expect(payload.description).toBe('Shared scoring guide');
    expect(payload.deletedAt).toBe(DELETE_FIELD);
    expect(typeof payload.updatedAt).toBe('number');
    expect(Object.values(payload).some((v) => v === undefined)).toBe(false);
  });

  it('deletes the description field when reviving a rubric that lost it', async () => {
    mockGetDoc.mockResolvedValue(
      snapshot({ description: 'stale', deletedAt: 900 })
    );
    const { description: _drop, ...noDescription } = rubric;
    await writePlcRubricEntry(PLC_ID, UID, {
      ...input,
      rubric: noDescription,
    });
    const payload = mockUpdateDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.description).toBe(DELETE_FIELD);
  });

  it('reports already-shared and writes nothing for a live entry', async () => {
    mockGetDoc.mockResolvedValue(snapshot({ id: 'rubric-1', deletedAt: null }));
    const outcome = await writePlcRubricEntry(PLC_ID, UID, input);

    expect(outcome).toBe('already-shared');
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});
