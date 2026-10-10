import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Type, type Schema } from '@google/genai';

const { generateContentMock, claudeStreamMock, secretValue, logSets } =
  vi.hoisted(() => ({
    generateContentMock: vi.fn(),
    claudeStreamMock: vi.fn(),
    secretValue: { current: '' },
    logSets: [] as { id: string; data: Record<string, unknown> }[],
  }));

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAIMock() {
      return { models: { generateContent: generateContentMock } };
    }),
  };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { stream: claudeStreamMock } };
  }),
}));

vi.mock('./secrets', () => ({
  ANTHROPIC_API_KEY: { value: () => secretValue.current },
}));

vi.mock('firebase-admin', () => ({
  firestore: Object.assign(vi.fn(), {
    FieldValue: { increment: (n: number) => ({ inc: n }) },
  }),
}));

import { chooseModels, generateAi, toClaudeJsonSchema } from './aiRouter';
import {
  parseIntegrationModels,
  resetAiModelConfigCache,
  type AiModelConfig,
} from './aiModelConfig';

const config = (
  integrationModels: AiModelConfig['integrationModels'] = {}
): AiModelConfig => ({
  advancedModel: 'gemini-3.8-flash',
  standardModel: 'gemini-3.5-flash-lite',
  integrationModels,
  usedFallback: false,
});

const fakeDb = (cfg: Record<string, unknown> = {}) =>
  ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: () =>
          Promise.resolve({
            data: () => (name === 'global_permissions' ? { config: cfg } : {}),
          }),
        set: (data: Record<string, unknown>) => {
          logSets.push({ id, data });
          return Promise.resolve();
        },
      }),
    }),
  }) as never;

const geminiOk = (text = '{"ok":true}') => ({
  text,
  candidates: [{ finishReason: 'STOP' }],
  usageMetadata: {
    promptTokenCount: 10,
    candidatesTokenCount: 5,
    thoughtsTokenCount: 2,
  },
});

const claudeOk = (text = '{"ok":true}', stop = 'end_turn') => ({
  finalMessage: () =>
    Promise.resolve({
      stop_reason: stop,
      content: [{ type: 'text', text }],
      usage: { input_tokens: 20, output_tokens: 8 },
    }),
});

beforeEach(() => {
  vi.clearAllMocks();
  logSets.length = 0;
  secretValue.current = '';
  resetAiModelConfigCache();
});

describe('chooseModels', () => {
  it('uses the tier model when nothing is chosen for the integration', () => {
    expect(chooseModels({ integration: 'quiz' }, config())).toEqual({
      model: 'gemini-3.5-flash-lite',
      geminiFallback: 'gemini-3.5-flash-lite',
    });
    expect(chooseModels({ integration: 'mini-app' }, config()).model).toBe(
      'gemini-3.8-flash'
    );
  });

  it('prefers the AI tab choice, then a legacy per-feature model', () => {
    const cfg = config({ quiz: 'claude-sonnet-5-5' });
    expect(chooseModels({ integration: 'quiz' }, cfg).model).toBe(
      'claude-sonnet-5-5'
    );
    expect(
      chooseModels(
        { integration: 'video-transcription', legacyModel: 'gemini-2.5-flash' },
        cfg
      ).model
    ).toBe('gemini-2.5-flash');
  });

  it('lets a tier override pick the fallback', () => {
    expect(
      chooseModels(
        { integration: 'paper-handwriting', tier: 'advanced' },
        config()
      ).geminiFallback
    ).toBe('gemini-3.8-flash');
  });
});

describe('parseIntegrationModels', () => {
  it('drops unknown integrations, bad ids and models no longer allowed', () => {
    expect(
      parseIntegrationModels(
        {
          quiz: 'claude-sonnet-5-5',
          poll: 'claude-opus-5-5',
          nope: 'claude-sonnet-5-5',
          ocr: 'gpt-5',
        },
        ['claude-sonnet-5-5']
      )
    ).toEqual({ quiz: 'claude-sonnet-5-5' });
  });
});

describe('toClaudeJsonSchema', () => {
  it('lowercases types, closes objects and turns nullable into anyOf', () => {
    const schema: Schema = {
      type: Type.OBJECT,
      required: ['title'],
      properties: {
        title: { type: Type.STRING, description: 'Quiz title' },
        tags: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: '1' },
        note: { type: Type.STRING, nullable: true },
      },
    };
    expect(toClaudeJsonSchema(schema)).toEqual({
      type: 'object',
      required: ['title'],
      additionalProperties: false,
      properties: {
        title: { type: 'string', description: 'Quiz title' },
        tags: { type: 'array', items: { type: 'string' } },
        note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
    });
  });
});

describe('generateAi', () => {
  it('runs Gemini by default and logs the call', async () => {
    generateContentMock.mockResolvedValue(geminiOk());
    const result = await generateAi(fakeDb(), {
      integration: 'quiz',
      parts: [{ text: 'hi' }],
      responseMimeType: 'application/json',
    });
    expect(result).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      inputTokens: 10,
      outputTokens: 7,
      fellBack: false,
    });
    expect(claudeStreamMock).not.toHaveBeenCalled();
    expect(logSets[0].id).toMatch(/__quiz__gemini-3_5-flash-lite$/);
    expect(logSets[0].data).toMatchObject({ calls: { inc: 1 } });
  });

  it('stays on Gemini while the Claude key is a placeholder', async () => {
    secretValue.current = 'placeholder';
    generateContentMock.mockResolvedValue(geminiOk());
    const result = await generateAi(
      fakeDb({ integrationModels: { quiz: 'claude-sonnet-5-5' } }),
      { integration: 'quiz', parts: [{ text: 'hi' }] }
    );
    expect(claudeStreamMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ provider: 'gemini', fellBack: true });
  });

  it('runs Claude with a schema when chosen and configured', async () => {
    secretValue.current = 'sk-ant-test';
    claudeStreamMock.mockReturnValue(claudeOk());
    const result = await generateAi(
      fakeDb({ integrationModels: { quiz: 'claude-sonnet-5-5' } }),
      {
        integration: 'quiz',
        parts: [{ text: 'hi' }],
        systemInstruction: 'Be brief.',
        responseMimeType: 'application/json',
        responseSchema: { type: Type.OBJECT, properties: {} },
        temperature: 0.3,
      }
    );
    expect(result).toMatchObject({
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      fellBack: false,
    });
    const request = claudeStreamMock.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(request).toMatchObject({
      model: 'claude-sonnet-5-5',
      system: 'Be brief.',
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema' },
      },
    });
    expect(request).not.toHaveProperty('temperature');
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('falls back to the tier Gemini model when Claude fails', async () => {
    secretValue.current = 'sk-ant-test';
    claudeStreamMock.mockReturnValue({
      finalMessage: () => Promise.reject(new Error('credit balance too low')),
    });
    generateContentMock.mockResolvedValue(geminiOk());
    const result = await generateAi(
      fakeDb({ integrationModels: { 'mini-app': 'claude-opus-5-5' } }),
      { integration: 'mini-app', parts: [{ text: 'hi' }] }
    );
    expect(result).toMatchObject({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      fellBack: true,
    });
    expect(logSets[0].data).toMatchObject({ fallbacks: { inc: 1 } });
  });

  it('falls back when Claude stops early or refuses', async () => {
    secretValue.current = 'sk-ant-test';
    claudeStreamMock.mockReturnValue(claudeOk('', 'refusal'));
    generateContentMock.mockResolvedValue(geminiOk());
    const result = await generateAi(
      fakeDb({ integrationModels: { poll: 'claude-haiku-5-5' } }),
      { integration: 'poll', parts: [{ text: 'hi' }] }
    );
    expect(result.provider).toBe('gemini');
  });

  it('sends audio, video and Word files to Gemini even when Claude is chosen', async () => {
    secretValue.current = 'sk-ant-test';
    generateContentMock.mockResolvedValue(geminiOk());
    const result = await generateAi(
      fakeDb({
        integrationModels: { 'quiz-document-import': 'claude-sonnet-5-5' },
      }),
      {
        integration: 'quiz-document-import',
        parts: [
          { text: 'read' },
          {
            inlineData: {
              mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              data: 'AAAA',
            },
          },
        ],
      }
    );
    expect(claudeStreamMock).not.toHaveBeenCalled();
    expect(result.provider).toBe('gemini');
  });

  it('logs a failed Gemini call and rethrows', async () => {
    generateContentMock.mockRejectedValue(new Error('503'));
    await expect(
      generateAi(fakeDb(), { integration: 'poll', parts: [{ text: 'hi' }] })
    ).rejects.toThrow('503');
    expect(logSets[0].data).toMatchObject({ errors: { inc: 1 } });
  });
});

describe('model call boundary', () => {
  it('only aiRouter.ts calls Gemini or Claude directly', () => {
    const dir = __dirname;
    const offenders = (readdirSync(dir, { recursive: true }) as string[])
      .filter(
        (f) =>
          f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'aiRouter.ts'
      )
      .filter((f) => {
        const src = readFileSync(join(dir, f), 'utf8');
        return (
          /\.generateContent(Stream)?\(/.test(src) ||
          /new GoogleGenAI\(/.test(src) ||
          /@anthropic-ai\/sdk/.test(src)
        );
      });
    expect(offenders).toEqual([]);
  });
});
