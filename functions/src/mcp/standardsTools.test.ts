import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ToolContext } from './activity';
import { gradeCovers, registerStandardsTools } from './standardsTools';

type Data = Record<string, unknown>;
const row = (
  set: string,
  code: string,
  subject: string,
  grade: string,
  text: string
) => ({
  id: `${set}:${code}`,
  data: {
    set,
    code,
    subject,
    grade,
    text,
    searchText: `${code} ${text}`.toLowerCase(),
  },
});
const ROWS = [
  row(
    'mn-ela-2020',
    '7.4.1.1',
    'ela',
    '7',
    'Cite several pieces of textual evidence'
  ),
  row(
    'mn-ela-2020',
    '7.4.2.2',
    'ela',
    '7',
    'Determine a central idea of a text'
  ),
  row(
    'mn-ela-2020',
    '6.4.2.2',
    'ela',
    '6',
    'Determine a central idea of a text'
  ),
  row(
    'mn-ss-2021',
    '7.4.2.2',
    'social-studies',
    '7',
    'Explain causes of the Revolution'
  ),
  row(
    'mn-ela-2020',
    '9.4.1.1',
    'ela',
    '9-10',
    'Cite strong and thorough evidence'
  ),
];

function fakeDb() {
  const reads: string[] = [];
  const snap = (r: (typeof ROWS)[number]) => ({
    id: r.id,
    exists: true,
    data: () => r.data,
  });
  return {
    reads,
    db: {
      doc: (path: string) => ({
        get: () => {
          const r = ROWS.find((x) => `standards_catalog/${x.id}` === path);
          return Promise.resolve(
            r ? snap(r) : { id: path, exists: false, data: () => undefined }
          );
        },
      }),
      collection: () => ({
        where: (field: string, _op: string, value: string) => {
          const q = {
            limit: () => q,
            get: () => {
              reads.push(`${field}=${value}`);
              return Promise.resolve({
                docs: ROWS.filter((r) => (r.data as Data)[field] === value).map(
                  snap
                ),
              });
            },
          };
          return q;
        },
      }),
    },
  };
}

async function connect(db: unknown) {
  const server = new McpServer({ name: 't', version: '1' });
  registerStandardsTools(server, { db, uid: 'u1' } as unknown as ToolContext);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return async (args: Data) => {
    const res = (await client.callTool({
      name: 'search_standards',
      arguments: args,
    })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    return res.isError
      ? { error: res.content[0].text }
      : (JSON.parse(res.content[0].text) as Data);
  };
}

describe('search_standards', () => {
  it('filters a subject by grade and topic words', async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    expect(
      await call({ subject: 'ela', grade: '7', query: 'central idea' })
    ).toEqual({
      standards: [
        {
          code: '7.4.2.2',
          grade: '7',
          text: 'Determine a central idea of a text',
        },
      ],
      total: 1,
    });
  });

  it('matches grade bands', () => {
    expect(gradeCovers('9-10', '10')).toBe(true);
    expect(gradeCovers('9-10', '11')).toBe(false);
    expect(gradeCovers('K', 'k')).toBe(true);
  });

  it('looks up a code across subjects and gives full ids when shared', async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    const out = (await call({ query: 'MN 7.4.2.2' })) as {
      standards: { code: string }[];
    };
    expect(out.standards.map((s) => s.code).sort()).toEqual([
      'mn-ela-2020:7.4.2.2',
      'mn-ss-2021:7.4.2.2',
    ]);
  });

  it('caps results and says to narrow', async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    const out = await call({ subject: 'ela', limit: 2 });
    expect((out.standards as unknown[]).length).toBe(2);
    expect(out.total).toBe(4);
    expect(out.note).toMatch(/narrow/);
  });

  it('says when a subject has no standards loaded, and rereads it next time', async () => {
    const { db, reads } = fakeDb();
    const call = await connect(db);
    const out = await call({ subject: 'science', grade: '6' });
    expect(out.standards).toEqual([]);
    expect(out.note).toMatch(/no science standards loaded/);
    await call({ subject: 'science' });
    expect(reads.filter((r) => r === 'subject=science')).toHaveLength(2);
  });

  it('notes an unknown code', async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    const out = await call({ query: '6E.3.1.1.1' });
    expect(out.standards).toEqual([]);
    expect(out.note).toMatch(/No benchmark has that code/);
  });

  it('needs a subject without a code', async () => {
    const { db } = fakeDb();
    const call = await connect(db);
    expect(await call({ query: 'evidence' })).toEqual({
      error: 'Give a subject, or a benchmark code as the query.',
    });
  });
});
