import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import {
  applyStandards,
  normalizeStandardRef,
  tagFromBenchmark,
  type TargetTag,
} from './standards';
import { toFriendlyQuestion, type StoredQuestion } from './quizStore';
import { REVIEW_LOOP, registerPrompts } from './prompts';
import { READ_ONLY, slimTool, slimToolListing } from './toolKit';

const ela = {
  id: 'mn-ela-2020:6.1.2.1',
  set: 'mn-ela-2020',
  code: '6.1.2.1',
  standard: 'R2 Key Ideas: Determine central ideas.',
  text: 'Determine a central idea of a text.',
};
const ss = {
  id: 'mn-ss-2021:6.1.2.1',
  set: 'mn-ss-2021',
  code: '6.1.2.1',
  standard: '1. Civic Skills: Apply civic reasoning.',
  text: 'Civic benchmark.',
};
const catalog = new Map([
  [ela.id, [ela]],
  [ss.id, [ss]],
  ['6.1.2.1', [ela, ss]],
  ['7.2.1.1', [{ ...ela, id: 'mn-ela-2020:7.2.1.1', code: '7.2.1.1' }]],
]);

describe('standards tags', () => {
  it('builds the same tag as the editor picker', () => {
    expect(tagFromBenchmark(ela)).toEqual({
      id: 'mn-ela-2020:6.1.2.1',
      kind: 'standard',
      code: '6.1.2.1',
      label: 'Determine a central idea of a text.',
      parentId: 'mn-ela-2020:std:R2',
      parentLabel: 'Key Ideas',
    });
    expect(tagFromBenchmark(ss).parentId).toBe('mn-ss-2021:std:1');
  });

  it('reads codes out of labels Claude may pass', () => {
    expect(normalizeStandardRef(' MN ELA 7.2.1.1 ')).toBe('7.2.1.1');
    expect(normalizeStandardRef('mn-ss-2021:6.1.2.1')).toBe(
      'mn-ss-2021:6.1.2.1'
    );
    expect(normalizeStandardRef('K.1.1.1')).toBe('K.1.1.1');
  });

  it('replaces standard tags but keeps PLC and personal targets', () => {
    const current: TargetTag[] = [
      { id: 'p1', kind: 'personal', label: 'Mine' },
      { id: 'mn-ela-2020:std:R9', kind: 'standard', code: 'R9', label: 'R9' },
    ];
    const out = applyStandards(1, current, ['7.2.1.1', 'R9'], catalog);
    expect(out.map((t) => t.id)).toEqual([
      'p1',
      'mn-ela-2020:std:R9',
      'mn-ela-2020:7.2.1.1',
    ]);
    expect(applyStandards(1, current, [], catalog)).toEqual([current[0]]);
  });

  it('rejects unknown and ambiguous codes with a fix', () => {
    expect(() => applyStandards(2, [], ['9.9.9.9'], catalog)).toThrow(
      /Question 2: "9.9.9.9" is not/
    );
    expect(() => applyStandards(1, [], ['6.1.2.1'], catalog)).toThrow(
      /full id/
    );
    expect(applyStandards(1, [], ['mn-ss-2021:6.1.2.1'], catalog)[0].id).toBe(
      'mn-ss-2021:6.1.2.1'
    );
  });

  it('shows standard codes on the question Claude reads', () => {
    const q: StoredQuestion = {
      id: 'q',
      timeLimit: 0,
      text: 'T',
      type: 'FIB',
      correctAnswer: 'a',
      incorrectAnswers: [],
      targets: [
        tagFromBenchmark(ela),
        { id: 'p1', kind: 'personal', label: 'Mine' },
      ],
    };
    expect(toFriendlyQuestion(q).standards).toEqual(['6.1.2.1']);
  });
});

async function connect(setup: (server: McpServer) => void) {
  const server = new McpServer({ name: 't', version: '1' });
  setup(server);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'c', version: '1' });
  await client.connect(b);
  return client;
}

describe('starter prompts', () => {
  it('lists five prompts and carries the review loop and the inputs', async () => {
    const client = await connect(registerPrompts);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual([
      'quiz_from_reading',
      'flashcards_from_vocab',
      'video_activity_from_youtube',
      'rubric_for_assignment',
      'how_did_my_class_do',
    ]);
    const quiz = await client.getPrompt({
      name: 'quiz_from_reading',
      arguments: { grade: '7', reading: 'The mitochondria...' },
    });
    const text = (quiz.messages[0].content as { text: string }).text;
    expect(text).toContain(REVIEW_LOOP);
    expect(text).toContain('Grade: 7');
    expect(text).toContain('The mitochondria...');
    const results = await client.getPrompt({
      name: 'how_did_my_class_do',
      arguments: {},
    });
    expect((results.messages[0].content as { text: string }).text).toContain(
      'my most recent quiz'
    );
  });
});

describe('slim tool listing', () => {
  it('drops protocol defaults but keeps the schema and hints', async () => {
    const client = await connect((server) => {
      server.registerTool(
        'get_x',
        {
          title: 'Get x',
          description: 'd',
          inputSchema: { id: z.string() },
          annotations: READ_ONLY,
        },
        () => ({ content: [] })
      );
      slimToolListing(server);
    });
    const { tools } = await client.listTools();
    expect(tools[0].inputSchema).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    });
    expect(tools[0].annotations).toEqual({
      readOnlyHint: true,
      openWorldHint: false,
    });
    expect('execution' in tools[0]).toBe(false);
    expect(
      slimTool({ annotations: { readOnlyHint: false, destructiveHint: true } })
        .annotations
    ).toEqual({ readOnlyHint: false, destructiveHint: true });
  });
});

describe('standards lookup cap', () => {
  it('refuses a save that would read an unbounded number of catalog docs', async () => {
    const { loadBenchmarks, MAX_STANDARDS_PER_SAVE } =
      await import('./standards');
    const refs = Array.from(
      { length: MAX_STANDARDS_PER_SAVE + 1 },
      (_, i) => `6.1.${i}.1`
    );
    await expect(loadBenchmarks({} as never, refs)).rejects.toThrow(
      /at most 100/
    );
  });
});
