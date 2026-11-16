import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { writeGenerated } from './helpers/writeGenerated';
import * as client from '@/utils/course/contract';
import * as copy from '@/functions/src/course/shared.gen';

const SOURCE = 'utils/course/contract.ts';
const FILE = resolve(process.cwd(), 'functions/src/course/shared.gen.ts');

const generated = () =>
  [
    '// Generated from utils/course/contract.ts by tests/courseSharedCopy.test.ts; rerun it with UPDATE_COURSE_SHARED_COPY=1.',
    readFileSync(resolve(process.cwd(), SOURCE), 'utf8'),
  ].join('\n');

describe('functions copy of the course contract', () => {
  it('matches utils/course/contract.ts (UPDATE_COURSE_SHARED_COPY=1 rewrites it)', async () => {
    const text = generated();
    if (process.env.UPDATE_COURSE_SHARED_COPY) {
      await writeGenerated(FILE, text);
      return;
    }
    const config = await resolveConfig(FILE);
    const expected = await format(text, { ...config, filepath: FILE });
    expect(readFileSync(FILE, 'utf8')).toBe(expected);
  });

  it('has no imports, so functions/ can compile it on its own', () => {
    expect(readFileSync(FILE, 'utf8')).not.toMatch(/^import /m);
  });

  it('cleans links and agendas exactly like the client', () => {
    const links = [
      { title: '  Class  site ', url: 'https://example.com/a' },
      { title: '', url: 'http://docs.google.com/x' },
      { title: 'Bad', url: 'javascript:alert(1)' },
      { title: 'Creds', url: 'https://u:p@evil.example' },
    ];
    expect(copy.cleanPinnedLinks(links)).toEqual(
      client.cleanPinnedLinks(links)
    );
    const agenda = { fileId: 'abcDEF_123-xyz', title: ' Week 1 ' };
    expect(copy.cleanCourseAgenda(agenda)).toEqual(
      client.cleanCourseAgenda(agenda)
    );
  });
});
