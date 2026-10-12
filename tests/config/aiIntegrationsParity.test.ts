import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_INTEGRATIONS } from '@/config/aiIntegrations';
import {
  CLAUDE_MODELS,
  DEFAULT_ADVANCED_MODEL,
  DEFAULT_STANDARD_MODEL,
} from '@/config/aiModels';

const serverSource = (file: string): string =>
  readFileSync(resolve(__dirname, '../../functions/src', file), 'utf8');

describe('AI integrations registry', () => {
  it('lists exactly the server integrations, with the same tiers and inputs', () => {
    const source = serverSource('aiIntegrations.ts');
    const server = [
      ...source.matchAll(
        /'?([\w-]+)'?: \{ tier: '(\w+)', inputs: \[([^\]]*)\] \}/g
      ),
    ].map(([, id, tier, inputs]) => ({
      id,
      tier,
      inputs: [...inputs.matchAll(/'(\w+)'/g)].map((m) => m[1]),
    }));
    expect(server.length).toBeGreaterThan(0);
    const client = AI_INTEGRATIONS.map(({ id, tier, inputs }) => ({
      id,
      tier,
      inputs: [...inputs],
    }));
    const byId = (a: { id: string }, b: { id: string }) =>
      a.id.localeCompare(b.id);
    expect([...client].sort(byId)).toEqual([...server].sort(byId));
  });

  it('every integration is called somewhere on the server', () => {
    const callers = [
      'aiGeneration.ts',
      'plcMeetingNotes.ts',
      'plcGoalCoach.ts',
      'quizDocumentExtract.ts',
      'quizStimulusText.ts',
      'paperTranscribe.ts',
      'quizTranslation.ts',
    ]
      .map(serverSource)
      .join('\n');
    // generateWithAI passes its generation type, so those ids appear as prompt-map keys.
    const unused = AI_INTEGRATIONS.filter(
      ({ id }) => !callers.includes(`'${id}'`)
    ).map(({ id }) => id);
    expect(unused).toEqual([]);
  });
});

describe('Claude model list', () => {
  it('matches the server list of Claude ids', () => {
    const block = /CLAUDE_MODEL_IDS = \[([\s\S]*?)\]/.exec(
      serverSource('aiModels.ts')
    );
    const server = [...(block?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
      (m) => m[1]
    );
    expect(CLAUDE_MODELS.map((m) => m.id).sort()).toEqual(server.sort());
  });
});

describe('tier default models', () => {
  it('match the server defaults', () => {
    const source = serverSource('aiModelConfig.ts');
    const read = (name: string) =>
      new RegExp(`${name} = '([^']+)'`).exec(source)?.[1];
    expect(DEFAULT_ADVANCED_MODEL).toBe(read('DEFAULT_ADVANCED_MODEL'));
    expect(DEFAULT_STANDARD_MODEL).toBe(read('DEFAULT_STANDARD_MODEL'));
  });
});
