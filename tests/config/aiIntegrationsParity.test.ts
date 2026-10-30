import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_INTEGRATIONS } from '@/config/aiIntegrations';
import {
  CLAUDE_MODELS,
  DEFAULT_ADVANCED_MODEL,
  DEFAULT_STANDARD_MODEL,
} from '@/config/aiModels';
import * as clientLimits from '@/config/aiLimits';

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

  it('has the same default models as the server', () => {
    const source = serverSource('aiIntegrations.ts');
    const block = /AI_INTEGRATION_DEFAULT_MODELS[\s\S]*?= \{([\s\S]*?)\};/.exec(
      source
    )?.[1];
    const server = Object.fromEntries(
      [...(block ?? '').matchAll(/'([\w-]+)': '([^']+)'/g)].map(
        ([, id, model]) => [id, model]
      )
    );
    const client = Object.fromEntries(
      AI_INTEGRATIONS.flatMap((i) =>
        i.defaultModel ? [[i.id, i.defaultModel]] : []
      )
    );
    expect(Object.keys(server).length).toBeGreaterThan(0);
    expect(client).toEqual(server);
  });

  it('marks the same integrations as never falling back to Gemini', () => {
    const source = serverSource('aiIntegrations.ts');
    const block =
      /AI_INTEGRATIONS_WITHOUT_FALLBACK[\s\S]*?new Set<AiIntegrationId>\(\[([\s\S]*?)\]\)/.exec(
        source
      )?.[1];
    const server = [...(block ?? '').matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
    const client = AI_INTEGRATIONS.filter((i) => i.noFallback).map((i) => i.id);
    expect(server.length).toBeGreaterThan(0);
    expect(client.sort()).toEqual(server.sort());
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
      'webTourWriting.ts',
      'importConversionAi.ts',
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

describe('AI limits', () => {
  it('match the server defaults, bounds and prompt-limited list', () => {
    const source = serverSource('aiLimits.ts');
    const num = (name: string) =>
      Number(
        new RegExp(`const ${name} = ([\\d_]+);`)
          .exec(source)?.[1]
          ?.replace(/_/g, '')
      );
    for (const name of [
      'DEFAULT_MAX_INPUT_CHARS',
      'MIN_INPUT_CHARS',
      'MAX_INPUT_CHARS',
      'MIN_OUTPUT_TOKENS',
      'MAX_OUTPUT_TOKENS',
    ] as const) {
      expect(clientLimits[name]).toBe(num(name));
    }
    const block = (name: string) =>
      /=\s*(\{[\s\S]*?\}|\[[\s\S]*?\]);/.exec(
        source.slice(source.indexOf(name))
      )?.[1] ?? '';
    const entries = (text: string) =>
      Object.fromEntries(
        [...text.matchAll(/'?([\w-]+)'?: ([\d_]+)/g)].map(([, k, v]) => [
          k,
          Number(v.replace(/_/g, '')),
        ])
      );
    expect(clientLimits.INPUT_CHARS_DEFAULTS).toEqual(
      entries(block('INPUT_CHARS_DEFAULTS'))
    );
    expect(clientLimits.CLAUDE_OUTPUT_TOKENS_DEFAULTS).toEqual(
      entries(block('CLAUDE_OUTPUT_TOKENS_DEFAULTS'))
    );
    expect([...clientLimits.PROMPT_LIMITED_INTEGRATIONS]).toEqual(
      [...block('PROMPT_LIMITED_INTEGRATIONS').matchAll(/'([\w-]+)'/g)].map(
        (m) => m[1]
      )
    );
  });
});
