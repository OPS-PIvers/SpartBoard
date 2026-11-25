import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { staysOpenAtClose } from './staysOpenAtClose';

interface Case {
  name: string;
  session: Record<string, unknown>;
  response: Record<string, unknown>;
  blank: boolean;
  expected: boolean;
}

const NOW = 1000;
const cases = JSON.parse(
  readFileSync(resolve(__dirname, 'staysOpenAtClose.cases.json'), 'utf8')
) as Case[];

describe('staysOpenAtClose (server)', () => {
  it.each(cases)('$name', (c) => {
    expect(
      staysOpenAtClose(c.session, c.response, NOW, { blank: c.blank })
    ).toBe(c.expected);
  });
});
