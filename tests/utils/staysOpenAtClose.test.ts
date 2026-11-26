import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { staysOpenAtClose } from '@/utils/staysOpenAtClose';

interface Case {
  name: string;
  session: Record<string, unknown>;
  response: { studentUid?: string; unlocked?: boolean };
  blank: boolean;
  expected: boolean;
}

const NOW = 1000;
const cases = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'functions', 'src', 'staysOpenAtClose.cases.json'),
    'utf8'
  )
) as Case[];

describe('staysOpenAtClose (client)', () => {
  it.each(cases)('$name', (c) => {
    expect(
      staysOpenAtClose(c.session, c.response, NOW, { blank: c.blank })
    ).toBe(c.expected);
  });
});
