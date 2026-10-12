// search_standards: the MN standards SpartBoard holds, filtered by subject and grade so a result stays a few hundred tokens.
import type * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ToolError, type ToolContext } from './activity';
import { normalizeStandardRef } from './standards';
import { READ_ONLY, run } from './toolKit';

export const SUBJECTS = [
  'ela',
  'social-studies',
  'math',
  'science',
  'pe-health',
  'art',
  'music',
  'world-language',
] as const;
const MAX_RESULTS = 25;
const TEXT_MAX = 300;
const CACHE_MS = 60 * 60 * 1000;

interface Row {
  id: string;
  set: string;
  code: string;
  grade: string;
  subject: string;
  text: string;
  searchText: string;
}

// The catalog changes only on a re-seed, so each subject is read once per instance per hour.
const cache = new Map<string, { at: number; rows: Row[] }>();

const toRow = (snap: admin.firestore.DocumentSnapshot): Row => {
  const d = snap.data() ?? {};
  const text = String(d.text ?? '');
  return {
    id: snap.id,
    set: String(d.set ?? ''),
    code: String(d.code ?? ''),
    grade: String(d.grade ?? ''),
    subject: String(d.subject ?? ''),
    text,
    searchText: String(d.searchText ?? `${d.code} ${text}`).toLowerCase(),
  };
};

async function subjectRows(db: admin.firestore.Firestore, subject: string) {
  const hit = cache.get(subject);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const snap = await db
    .collection('standards_catalog')
    .where('subject', '==', subject)
    .get();
  const rows = snap.docs.map(toRow);
  cache.set(subject, { at: Date.now(), rows });
  return rows;
}

const gradeNum = (g: string) => (g.toUpperCase() === 'K' ? 0 : Number(g));

/** True when `grade` ('7', 'K' or a band like '9-12') covers the asked grade. */
export function gradeCovers(grade: string, asked: string): boolean {
  const band = /^(K|\d{1,2})-(\d{1,2})$/i.exec(grade);
  if (!band) return grade.toUpperCase() === asked.toUpperCase();
  const n = gradeNum(asked);
  return n >= gradeNum(band[1]) && n <= gradeNum(band[2]);
}

const looksLikeCode = (q: string) => /\d+(?:\.\w+){2,}/.test(q);

/** Codes shared by two sets come back with the full id, which the save tools need. */
function present(rows: Row[], all: Row[]) {
  return rows.map((r) => {
    const shared = all.filter((o) => o.code === r.code).length > 1;
    return {
      code: shared ? r.id : r.code,
      grade: r.grade,
      text:
        r.text.length > TEXT_MAX ? `${r.text.slice(0, TEXT_MAX - 1)}…` : r.text,
    };
  });
}

export function filterRows(
  rows: Row[],
  opts: { query?: string; grade?: string }
): Row[] {
  const terms = (opts.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return rows
    .filter((r) => !opts.grade || gradeCovers(r.grade, opts.grade))
    .filter((r) => terms.every((t) => r.searchText.includes(t)))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

export function registerStandardsTools(
  server: McpServer,
  ctx: ToolContext
): void {
  server.registerTool(
    'search_standards',
    {
      title: 'Search Minnesota standards',
      description: `Searches the Minnesota benchmarks SpartBoard can tag, the same list as the editor's Learning Targets picker. Give a subject and grade with a few topic words, or look up one code. Returns at most ${MAX_RESULTS}; narrow the words rather than paging. Use the returned code in a question's standards.`,
      inputSchema: {
        subject: z
          .enum(SUBJECTS)
          .optional()
          .describe('Required unless query is a benchmark code.'),
        grade: z
          .string()
          .regex(/^(K|[1-9]|1[0-2])$/i)
          .optional()
          .describe("'K' or '1' to '12'."),
        query: z
          .string()
          .max(100)
          .optional()
          .describe(
            'Topic words that must all appear, e.g. "central idea", or a code like 7.4.1.1.'
          ),
        limit: z.number().int().min(1).max(MAX_RESULTS).optional(),
      },
      annotations: READ_ONLY,
    },
    ({ subject, grade, query, limit }) =>
      run('search_standards', ctx, async () => {
        const max = limit ?? 10;
        if (query && looksLikeCode(query)) {
          const ref = normalizeStandardRef(query);
          const snaps = ref.includes(':')
            ? [await ctx.db.doc(`standards_catalog/${ref}`).get()].filter(
                (s) => s.exists
              )
            : (
                await ctx.db
                  .collection('standards_catalog')
                  .where('code', '==', ref)
                  .limit(MAX_RESULTS)
                  .get()
              ).docs;
          const rows = snaps.map(toRow);
          return {
            standards: rows.map((r) => ({
              code: rows.length > 1 ? r.id : r.code,
              subject: r.subject,
              grade: r.grade,
              text: r.text,
            })),
          };
        }
        if (!subject) {
          throw new ToolError(
            'Give a subject, or a benchmark code as the query.'
          );
        }
        const all = await subjectRows(ctx.db, subject);
        const hits = filterRows(all, { query, grade });
        return {
          standards: present(hits.slice(0, max), all),
          total: hits.length,
          ...(hits.length > max
            ? { note: 'More match. Add a grade or more words to narrow it.' }
            : {}),
        };
      })
  );
}
