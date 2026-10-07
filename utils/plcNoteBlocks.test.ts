import { describe, expect, it } from 'vitest';
import type { PlcDoc, PlcNote, PlcNoteBlock } from '@/types';
import {
  MAX_NOTE_BLOCKS,
  parseNoteBlocks,
  sanitizeBlocksForWrite,
  selectDecisionsToRevisit,
  selectMemberActionItems,
  selectOpenActionItems,
  selectOpenDecisions,
} from './plcNoteBlocks';

const base = { section: 'Decisions', createdBy: 'u1', createdAt: 1 };

const note = (id: string, extra: Partial<PlcNote> = {}): PlcNote =>
  ({
    id,
    title: id,
    body: '',
    createdBy: 'u1',
    createdAt: 1,
    lastEditedBy: 'u1',
    lastEditedAt: 1,
    ...extra,
  }) as PlcNote;

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  text: id,
  done: false,
  createdBy: 'u1',
  createdAt: 1,
  ...extra,
});

describe('parseNoteBlocks', () => {
  it('keeps known kinds and drops malformed, duplicate and unknown entries', () => {
    const blocks = parseNoteBlocks([
      { ...base, id: 'd', kind: 'data', assessmentId: 'a1' },
      {
        ...base,
        id: 'x',
        kind: 'decision',
        text: 'Reteach Q5',
        status: 'weird',
        link: { kind: 'question', assessmentId: 'a1', questionId: 'q5' },
      },
      { ...base, id: 'g', kind: 'agenda', text: 'Calculators' },
      { ...base, id: 'g', kind: 'agenda', text: 'dupe' },
      { ...base, id: 'c', kind: 'chart' },
      { kind: 'agenda' },
      'nope',
    ]);
    expect(blocks.map((b) => b.id)).toEqual(['d', 'x', 'g']);
    expect(blocks[1]).toMatchObject({ status: 'open', revisitAt: null });
    expect(parseNoteBlocks(undefined)).toEqual([]);
  });

  it('drops a link with the wrong shape', () => {
    const [b] = parseNoteBlocks([
      {
        ...base,
        id: 'x',
        kind: 'decision',
        text: 't',
        link: { kind: 'target' },
      },
    ]);
    expect(b).toMatchObject({ link: null });
  });
});

describe('sanitizeBlocksForWrite', () => {
  it('caps the list and writes no undefined values', () => {
    const many: PlcNoteBlock[] = Array.from(
      { length: MAX_NOTE_BLOCKS + 5 },
      (_, i) => ({
        ...base,
        id: `g${i}`,
        kind: 'agenda' as const,
        text: 'x',
      })
    );
    expect(sanitizeBlocksForWrite(many)).toHaveLength(MAX_NOTE_BLOCKS);
    const [decision] = sanitizeBlocksForWrite([
      { ...base, id: 'x', kind: 'decision', text: 't', status: 'open' },
    ]);
    expect(Object.values(decision)).not.toContain(undefined);
    expect(decision).toMatchObject({
      decidedAt: null,
      revisitAt: null,
      link: null,
    });
  });
});

describe('team rollups', () => {
  const notes = [
    note('n1', {
      blocks: [
        {
          ...base,
          id: 'a',
          kind: 'decision',
          text: 'Open one',
          status: 'open',
          revisitAt: 50,
        },
        { ...base, id: 'b', kind: 'decision', text: '', status: 'open' },
        {
          ...base,
          id: 'c',
          kind: 'decision',
          text: 'Done',
          status: 'decided',
          revisitAt: Date.now() + 86_400_000,
        },
      ],
      actionItems: [
        item('i1', { assigneeUid: 'u2', dueAt: 30 }),
        item('i2', { done: true, assigneeUid: 'u2' }),
        item('i3', { assigneeUid: 'u3' }),
      ],
    }),
    note('gone', {
      deletedAt: 5,
      blocks: [
        { ...base, id: 'z', kind: 'decision', text: 'Hidden', status: 'open' },
      ],
      actionItems: [item('i9', { assigneeUid: 'u2' })],
    }),
  ];
  const docs = [
    {
      id: 'doc',
      actionItems: [item('i4', { assigneeUid: 'u2', dueAt: 10 })],
    } as unknown as PlcDoc,
  ];

  it('lists open decisions with text on live notes only', () => {
    expect(selectOpenDecisions(notes).map((d) => d.block.id)).toEqual(['a']);
  });

  it('lists decided decisions still due for a revisit', () => {
    expect(
      selectDecisionsToRevisit(notes, Date.now()).map((d) => d.block.id)
    ).toEqual(['c']);
  });

  it('rolls up open action items from notes and docs, soonest due first', () => {
    expect(selectOpenActionItems(notes, docs).map((v) => v.item.id)).toEqual([
      'i4',
      'i1',
      'i3',
    ]);
  });

  it('filters to one member for My items', () => {
    expect(
      selectMemberActionItems(notes, docs, 'u2').map((v) => v.item.id)
    ).toEqual(['i4', 'i1']);
    expect(selectMemberActionItems(notes, docs, null)).toEqual([]);
  });
});
