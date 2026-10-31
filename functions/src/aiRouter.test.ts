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

vi.mock('./firebaseAdmin', () => ({
  firestore: Object.assign(vi.fn(), {
    FieldValue: { increment: (n: number) => ({ inc: n }) },
  }),
}));

import {
  AiUnavailableError,
  chooseModels,
  generateAi,
  toClaudeJsonSchema,
} from './aiRouter';
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
  integrationLimits: {},
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
      fromTier: true,
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

  it("runs an integration's own default model only while the AI tab allows it", () => {
    const allowing = (allowedModels?: string[]) => ({
      ...config(),
      ...(allowedModels ? { allowedModels } : {}),
    });
    expect(
      chooseModels(
        { integration: 'web-tour-writing' },
        allowing(['gemini-3.8-flash', 'claude-sonnet-5-5'])
      )
    ).toEqual({
      model: 'claude-sonnet-5-5',
      geminiFallback: 'gemini-3.8-flash',
      fromTier: false,
    });
    for (const cfg of [allowing(['gemini-3.8-flash']), allowing()])
      expect(
        chooseModels({ integration: 'web-tour-writing' }, cfg)
      ).toMatchObject({ model: 'gemini-3.8-flash', fromTier: true });
    expect(
      chooseModels(
        { integration: 'web-tour-writing' },
        config({ 'web-tour-writing': 'gemini-3.8-flash' })
      )
    ).toMatchObject({ model: 'gemini-3.8-flash', fromTier: false });
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
      model: 'gemini-3.7-flash',
      fellBack: true,
    });
    expect(logSets[0]).toMatchObject({
      id: expect.stringMatching(/__mini-app__claude-opus-5-5$/) as unknown,
      data: { provider: 'claude', errors: { inc: 1 } },
    });
    expect(logSets[1]).toMatchObject({
      id: expect.stringMatching(/__mini-app__gemini-3_7-flash$/) as unknown,
      data: { fallbacks: { inc: 1 }, errors: { inc: 0 } },
    });
  });

  describe('an integration without fallback', () => {
    const allowsClaude = { allowedModels: ['claude-sonnet-5-5'] };
    const call = (cfg: Record<string, unknown>) =>
      generateAi(fakeDb(cfg), {
        integration: 'web-tour-writing',
        parts: [{ text: 'hi' }],
      });

    it('runs its Claude default', async () => {
      secretValue.current = 'sk-ant-test';
      claudeStreamMock.mockReturnValue(claudeOk());
      await expect(call(allowsClaude)).resolves.toMatchObject({
        provider: 'claude',
        model: 'claude-sonnet-5-5',
      });
    });

    it('fails instead of running Gemini when Claude fails or has no key', async () => {
      secretValue.current = 'sk-ant-test';
      claudeStreamMock.mockReturnValue({
        finalMessage: () => Promise.reject(new Error('overloaded')),
      });
      await expect(call(allowsClaude)).rejects.toBeInstanceOf(
        AiUnavailableError
      );
      secretValue.current = 'placeholder';
      await expect(call(allowsClaude)).rejects.toThrow(/API key/);
      expect(generateContentMock).not.toHaveBeenCalled();
    });

    it('fails when Claude is not allowed and the AI tab picks nothing', async () => {
      secretValue.current = 'sk-ant-test';
      await expect(
        call({ allowedModels: ['gemini-3.7-flash'] })
      ).rejects.toThrow(/pick one on the AI tab/);
      expect(claudeStreamMock).not.toHaveBeenCalled();
      expect(generateContentMock).not.toHaveBeenCalled();
    });

    it('runs Gemini only when the AI tab picks it', async () => {
      generateContentMock.mockResolvedValue(geminiOk());
      await expect(
        call({
          allowedModels: ['gemini-3.7-flash'],
          integrationModels: { 'web-tour-writing': 'gemini-3.7-flash' },
        })
      ).resolves.toMatchObject({ provider: 'gemini', fellBack: false });
    });
  });

  it('falls back when Claude times out, within the requested timeout', async () => {
    secretValue.current = 'sk-ant-test';
    claudeStreamMock.mockReturnValue({
      finalMessage: () =>
        Promise.reject(
          Object.assign(new Error('Request timed out.'), {
            name: 'APIConnectionTimeoutError',
          })
        ),
    });
    generateContentMock.mockResolvedValue(geminiOk());
    const result = await generateAi(
      fakeDb({ integrationModels: { 'guided-learning': 'claude-sonnet-5-5' } }),
      {
        integration: 'guided-learning',
        parts: [{ text: 'hi' }],
        claudeTimeoutMs: 1234,
      }
    );
    expect(result).toMatchObject({ provider: 'gemini', fellBack: true });
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    expect(vi.mocked(Anthropic).mock.calls.at(-1)?.[0]).toMatchObject({
      timeout: 1234,
    });
  });

  it('cuts off a Claude reply that is still streaming at the timeout', async () => {
    secretValue.current = 'sk-ant-test';
    claudeStreamMock.mockImplementation(
      (_body: unknown, opts?: { signal?: AbortSignal }) => ({
        finalMessage: () =>
          new Promise((_resolve, reject) =>
            opts?.signal?.addEventListener('abort', () =>
              reject(new Error('Request was aborted.'))
            )
          ),
      })
    );
    generateContentMock.mockResolvedValue(geminiOk());
    const result = await generateAi(
      fakeDb({ integrationModels: { 'guided-learning': 'claude-sonnet-5-5' } }),
      {
        integration: 'guided-learning',
        parts: [{ text: 'hi' }],
        claudeTimeoutMs: 20,
      }
    );
    expect(result).toMatchObject({ provider: 'gemini', fellBack: true });
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
    expect(logSets[0]).toMatchObject({
      id: expect.stringMatching(/__poll__claude-haiku-5-5$/) as unknown,
      data: {
        errors: { inc: 1 },
        inputTokens: { inc: 20 },
        outputTokens: { inc: 8 },
      },
    });
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
    ).rejects.toThrow('gemini-3.5-flash-lite: 503');
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

describe('output limits', () => {
  it('gives Claude a token budget by tier', async () => {
    secretValue.current = 'sk-ant-test';
    claudeStreamMock.mockReturnValue(claudeOk());
    await generateAi(
      fakeDb({ integrationModels: { 'mini-app': 'claude-opus-5-5' } }),
      { integration: 'mini-app', parts: [{ text: 'hi' }] }
    );
    expect(claudeStreamMock.mock.calls[0][0]).toMatchObject({
      max_tokens: 32_000,
    });
  });

  it('uses the admin output limit on Claude and Gemini', async () => {
    secretValue.current = 'sk-ant-test';
    claudeStreamMock.mockReturnValue(claudeOk());
    generateContentMock.mockResolvedValue(geminiOk());
    const db = fakeDb({
      integrationModels: { 'mini-app': 'claude-opus-5-5' },
      integrationLimits: {
        'mini-app': { maxOutputTokens: 48_000 },
        poll: { maxOutputTokens: 2_000 },
      },
    });
    await generateAi(db, { integration: 'mini-app', parts: [{ text: 'hi' }] });
    await generateAi(db, { integration: 'poll', parts: [{ text: 'hi' }] });
    expect(claudeStreamMock.mock.calls[0][0]).toMatchObject({
      max_tokens: 48_000,
    });
    expect(generateContentMock.mock.calls[0][0]).toMatchObject({
      config: { maxOutputTokens: 2_000 },
    });
  });
});
