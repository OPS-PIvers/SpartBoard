import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import {
  FinishReason,
  GoogleGenAI,
  type GenerateContentConfig,
  type Schema,
  type ThinkingLevel,
} from '@google/genai';
import { ANTHROPIC_API_KEY } from './secrets';
import {
  getAiModelConfig,
  vertexClientOptions,
  type AiModelConfig,
} from './aiModelConfig';
import { AI_INTEGRATIONS, type AiIntegrationId } from './aiIntegrations';
import { providerOf, type AiProvider, type AiTier } from './aiModels';
import { normalizeModelName } from './shared';

/** One of text, inline bytes or a file URI, in Gemini's part shape. */
export interface AiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
}

export interface AiRequest {
  integration: AiIntegrationId;
  parts: AiPart[];
  systemInstruction?: string;
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: Schema;
  temperature?: number;
  maxOutputTokens?: number;
  /** Gemini only; Claude uses effort by tier instead. */
  thinkingLevel?: ThinkingLevel;
  /** Overrides the integration's registered tier (paper handwriting's admin setting). */
  tier?: AiTier;
  /** A per-feature Gemini model saved before the AI tab existed; the AI tab's choice wins. */
  legacyModel?: unknown;
  /** How long Claude may take before the call falls back to Gemini; leave room in the function's own timeout. */
  claudeTimeoutMs?: number;
}

export interface AiResult {
  text: string;
  model: string;
  provider: AiProvider;
  /** `complete` also covers a Gemini response with no finish reason. */
  stopped: 'complete' | 'max_tokens' | 'other';
  finishReason?: string;
  inputTokens: number;
  /** Output plus thinking tokens. */
  outputTokens: number;
  /** True when Claude was chosen but the call ran on Gemini. */
  fellBack: boolean;
  /** True when the model config read failed and defaults were used. */
  usedFallbackConfig: boolean;
}

const CLAUDE_MEDIA = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

/** The real key, or '' for a missing or placeholder value. */
export function claudeApiKey(): string {
  let key = '';
  try {
    key = ANTHROPIC_API_KEY.value() ?? '';
  } catch {
    key = '';
  }
  return key.startsWith('sk-ant-') ? key : '';
}

export const claudeConfigured = (): boolean => claudeApiKey() !== '';

const claudeCanRead = (parts: AiPart[]): boolean =>
  parts.every((p) =>
    p.inlineData
      ? CLAUDE_MEDIA.has(p.inlineData.mimeType)
      : !p.fileData && p.text !== undefined
  );

/** The configured model for this call and the Gemini model that backs it up. */
export function chooseModels(
  req: Pick<AiRequest, 'integration' | 'tier' | 'legacyModel'>,
  config: AiModelConfig
): { model: string; geminiFallback: string } {
  const tier = req.tier ?? AI_INTEGRATIONS[req.integration].tier;
  const geminiFallback =
    tier === 'advanced' ? config.advancedModel : config.standardModel;
  const model =
    config.integrationModels[req.integration] ??
    normalizeModelName(req.legacyModel) ??
    geminiFallback;
  return { model, geminiFallback };
}

/** Gemini's OpenAPI-style schema as the JSON Schema subset Claude's structured outputs accept. */
export function toClaudeJsonSchema(schema: Schema): Record<string, unknown> {
  const type = schema.type ? String(schema.type).toLowerCase() : '';
  let out: Record<string, unknown> = {};
  if (type && type !== 'type_unspecified') out.type = type;
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [
        k,
        toClaudeJsonSchema(v),
      ])
    );
  }
  if (out.type === 'object' || schema.properties) {
    out.required = schema.required ?? [];
    out.additionalProperties = false;
  }
  if (schema.items) out.items = toClaudeJsonSchema(schema.items);
  if (schema.anyOf) out.anyOf = schema.anyOf.map(toClaudeJsonSchema);
  if (schema.nullable) out = { anyOf: [out, { type: 'null' }] };
  return out;
}

async function callGemini(
  model: string,
  req: AiRequest
): Promise<Omit<AiResult, 'fellBack' | 'usedFallbackConfig'>> {
  const config: GenerateContentConfig = {};
  if (req.systemInstruction) config.systemInstruction = req.systemInstruction;
  if (req.responseMimeType) config.responseMimeType = req.responseMimeType;
  if (req.responseSchema) config.responseSchema = req.responseSchema;
  if (req.thinkingLevel)
    config.thinkingConfig = { thinkingLevel: req.thinkingLevel };
  if (req.temperature !== undefined) config.temperature = req.temperature;
  if (req.maxOutputTokens) config.maxOutputTokens = req.maxOutputTokens;
  const ai = new GoogleGenAI(vertexClientOptions());
  const result = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: req.parts }],
    config,
  });
  const finishReason = result.candidates?.[0]?.finishReason;
  const usage = result.usageMetadata;
  return {
    text: result.text ?? '',
    model,
    provider: 'gemini',
    stopped:
      !finishReason || finishReason === FinishReason.STOP
        ? 'complete'
        : finishReason === FinishReason.MAX_TOKENS
          ? 'max_tokens'
          : 'other',
    finishReason,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens:
      (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
  };
}

async function callClaude(
  model: string,
  tier: AiTier,
  req: AiRequest
): Promise<Omit<AiResult, 'fellBack' | 'usedFallbackConfig'>> {
  const client = new Anthropic({
    apiKey: claudeApiKey(),
    maxRetries: 0,
    timeout: req.claudeTimeoutMs ?? 60_000,
  });
  const media: Anthropic.ContentBlockParam[] = [];
  const texts: Anthropic.ContentBlockParam[] = [];
  for (const part of req.parts) {
    if (part.text !== undefined) {
      texts.push({ type: 'text', text: part.text });
    } else if (part.inlineData) {
      const { mimeType, data } = part.inlineData;
      media.push(
        mimeType === 'application/pdf'
          ? {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data },
            }
          : {
              type: 'image',
              source: {
                type: 'base64',
                media_type:
                  mimeType as Anthropic.Base64ImageSource['media_type'],
                data,
              },
            }
      );
    }
  }
  const schema = req.responseSchema
    ? toClaudeJsonSchema(req.responseSchema)
    : undefined;
  const jsonNote =
    req.responseMimeType === 'application/json' && !schema
      ? 'Respond with a single JSON value only, with no prose and no code fences.'
      : '';
  const system = [req.systemInstruction, jsonNote].filter(Boolean).join('\n\n');
  const message = await client.messages
    .stream({
      model,
      max_tokens: req.maxOutputTokens ?? 16000,
      ...(system ? { system } : {}),
      // Media before text, as Claude reads documents best that way.
      messages: [{ role: 'user', content: [...media, ...texts] }],
      thinking: { type: 'adaptive' },
      output_config: {
        effort: tier === 'advanced' ? 'medium' : 'low',
        ...(schema ? { format: { type: 'json_schema', schema } } : {}),
      },
    })
    .finalMessage();
  if (message.stop_reason !== 'end_turn') {
    throw new Error(`Claude stopped early: ${message.stop_reason}`);
  }
  const text = message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
  if (!text) throw new Error('Empty response from Claude.');
  const usage = message.usage;
  return {
    text,
    model,
    provider: 'claude',
    stopped: 'complete',
    finishReason: message.stop_reason,
    inputTokens:
      usage.input_tokens +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
  };
}

interface CallLogEntry {
  integration: AiIntegrationId;
  model: string;
  provider: AiProvider;
  inputTokens: number;
  outputTokens: number;
  fellBack: boolean;
  failed: boolean;
}

/** One doc per day, integration and model in `ai_call_log`; never throws. */
async function logAiCall(
  db: admin.firestore.Firestore,
  entry: CallLogEntry
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const modelKey = entry.model.replace(/[^a-z0-9-]/gi, '_');
  const inc = (n: number) => admin.firestore.FieldValue.increment(n);
  try {
    await db
      .collection('ai_call_log')
      .doc(`${date}__${entry.integration}__${modelKey}`)
      .set(
        {
          date,
          integration: entry.integration,
          model: entry.model,
          provider: entry.provider,
          calls: inc(1),
          inputTokens: inc(entry.inputTokens),
          outputTokens: inc(entry.outputTokens),
          fallbacks: inc(entry.fellBack ? 1 : 0),
          errors: inc(entry.failed ? 1 : 0),
        },
        { merge: true }
      );
  } catch (error) {
    console.warn('[aiRouter] call log write failed', error);
  }
}

/** The one entry point for model calls: picks the model, runs Claude or Gemini, falls back to Gemini, logs the call. */
export async function generateAi(
  db: admin.firestore.Firestore,
  req: AiRequest
): Promise<AiResult> {
  const config = await getAiModelConfig(db);
  const tier = req.tier ?? AI_INTEGRATIONS[req.integration].tier;
  const { model, geminiFallback } = chooseModels(req, config);
  const usedFallbackConfig = config.usedFallback;

  let fellBack = false;
  if (providerOf(model) === 'claude') {
    if (claudeConfigured() && claudeCanRead(req.parts)) {
      try {
        const result = await callClaude(model, tier, req);
        await logAiCall(db, {
          ...result,
          integration: req.integration,
          fellBack: false,
          failed: false,
        });
        return { ...result, fellBack: false, usedFallbackConfig };
      } catch (error) {
        console.warn(
          `[aiRouter] ${req.integration} on ${model} failed; retrying on ${geminiFallback}`,
          error
        );
        await logAiCall(db, {
          integration: req.integration,
          model,
          provider: 'claude',
          inputTokens: 0,
          outputTokens: 0,
          fellBack: false,
          failed: true,
        });
      }
    }
    fellBack = true;
  }

  const geminiModel = providerOf(model) === 'gemini' ? model : geminiFallback;
  try {
    const result = await callGemini(geminiModel, req);
    await logAiCall(db, {
      ...result,
      integration: req.integration,
      fellBack,
      failed: false,
    });
    return { ...result, fellBack, usedFallbackConfig };
  } catch (error) {
    await logAiCall(db, {
      integration: req.integration,
      model: geminiModel,
      provider: 'gemini',
      inputTokens: 0,
      outputTokens: 0,
      fellBack,
      failed: true,
    });
    // Name the model in the message (callers surface it) without changing the error's type.
    if (error instanceof Error)
      error.message = `${geminiModel}: ${error.message}`;
    throw error;
  }
}
