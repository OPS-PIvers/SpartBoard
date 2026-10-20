import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as client from '@/utils/pronunciation/fitSpeakToDoc';
import * as server from '@/functions/src/pronunciation/fitSpeakToDoc';
import { SPEAK_DIALECTS } from '@/config/pronunciationGroups';

const body = (path: string) =>
  readFileSync(path, 'utf8').split('\n').slice(1).join('\n');

describe('fitSpeakToDoc client/server parity', () => {
  it('is the same code below the header line', () => {
    expect(body('utils/pronunciation/fitSpeakToDoc.ts')).toBe(
      body('functions/src/pronunciation/fitSpeakToDoc.ts')
    );
    expect(client.SPEAK_DOC_BUDGET_BYTES).toBe(server.SPEAK_DOC_BUDGET_BYTES);
  });

  it('gives a legacy stub every accent of its language', () => {
    for (const [language, dialects] of Object.entries(SPEAK_DIALECTS)) {
      const fitted = client.fitSpeakToDoc(
        'p',
        {
          cards: [
            {
              speak: {
                term: 'x',
                refs: [{ dialect: dialects[0], tokens: ['a'], stress: [] }],
                g2pVersion: 'v',
                status: 'ready',
              },
            },
          ],
        },
        0
      );
      expect(fitted.cards[0], language).toMatchObject({ speak: { dialects } });
    }
  });
});
