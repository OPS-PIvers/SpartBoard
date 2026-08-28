/**
 * Pure-helper tests for the PLC rubric library (M12 Phase 3-I): the
 * snapshot parser's malformed-doc defense and the attribution strip used
 * by import-from-PLC.
 */

import { describe, it, expect } from 'vitest';
import { parsePlcRubricEntry, toPortableRubric } from '@/hooks/usePlcRubrics';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import type { PlcRubricEntry } from '@/types';

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
    const doc = validDoc() as Record<string, unknown>;
    delete doc.sharedByName;
    delete doc.sharedByEmail;
    const entry = parsePlcRubricEntry('rubric-1', doc);
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
    const doc = validDoc() as Record<string, unknown>;
    delete doc.description;
    const entry = parsePlcRubricEntry('rubric-1', doc) as PlcRubricEntry;
    expect('description' in toPortableRubric(entry)).toBe(false);
  });
});
