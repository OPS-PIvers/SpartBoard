import { HttpsError } from 'firebase-functions/v2/https';
import type * as admin from 'firebase-admin';
import type { GoogleGenAIOptions } from '@google/genai';
import { normalizeModelName } from './shared';
import { normalizeAiModelId } from './aiModels';
import { isAiIntegrationId, type AiIntegrationId } from './aiIntegrations';

export const DEFAULT_ADVANCED_MODEL = 'gemini-3.8-flash';
export const DEFAULT_STANDARD_MODEL = 'gemini-3.5-flash-lite';

// Gemini 3.x models are global-endpoint only on Vertex; us-central1 returns model-not-found.
export const VERTEX_LOCATION = 'global';

// Vertex AI auth via ADC (not Developer API key) — needs roles/aiplatform.user; see docs/gemini-api-terms-audit.md.
export function vertexClientOptions(): GoogleGenAIOptions {
  // GCLOUD_PROJECT/GOOGLE_CLOUD_PROJECT aren't guaranteed on gen2 (Cloud Run); FIREBASE_CONFIG.projectId is, so it's a fallback, not a replacement.
  const project =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    projectIdFromFirebaseConfig();
  if (!project) {
    console.error(
      'CRITICAL: no Cloud project id in the environment (checked GCLOUD_PROJECT, ' +
        'GOOGLE_CLOUD_PROJECT, FIREBASE_CONFIG.projectId); cannot reach Vertex AI'
    );
    throw new HttpsError('internal', 'AI service is not configured.');
  }
  return { vertexai: true, project, location: VERTEX_LOCATION };
}

/** `FIREBASE_CONFIG.projectId`, or '' when unset or unparseable so the caller's clearer error wins. */
export function projectIdFromFirebaseConfig(): string {
  try {
    const parsed = JSON.parse(process.env.FIREBASE_CONFIG || '{}') as {
      projectId?: unknown;
    };
    return typeof parsed.projectId === 'string' ? parsed.projectId : '';
  } catch {
    return '';
  }
}

export interface AiModelConfig {
  /** Gemini model for advanced-tier integrations; also the fallback when Claude can't run. */
  advancedModel: string;
  /** Gemini model for standard-tier integrations; also the fallback when Claude can't run. */
  standardModel: string;
  /** Per-integration model chosen on the Admin Settings AI tab. */
  integrationModels: Partial<Record<AiIntegrationId, string>>;
  /** True when the Firestore read failed and defaults are in use. */
  usedFallback: boolean;
}

interface StoredConfig {
  advancedModel?: unknown;
  standardModel?: unknown;
  integrationModels?: unknown;
  allowedModels?: unknown;
}

// 5-minute cache on warm instances; admin changes propagate within that window.
const READ_CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { value: AiModelConfig; cachedAt: number } | null = null;

export function resetAiModelConfigCache(): void {
  cached = null;
}

/** Keeps only valid choices for known integrations, and only models still on the allowed list when one is saved. */
export function parseIntegrationModels(
  raw: unknown,
  allowedRaw: unknown
): Partial<Record<AiIntegrationId, string>> {
  if (!raw || typeof raw !== 'object') return {};
  const allowed = Array.isArray(allowedRaw)
    ? new Set(allowedRaw.map(normalizeAiModelId).filter(Boolean))
    : null;
  const out: Partial<Record<AiIntegrationId, string>> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const model = normalizeAiModelId(value);
    if (!isAiIntegrationId(id) || !model) continue;
    if (allowed && !allowed.has(model)) continue;
    out[id] = model;
  }
  return out;
}

/** Reads `global_permissions/gemini-functions.config`; tier defaults stay Gemini so the fallback always exists. */
export async function getAiModelConfig(
  db: admin.firestore.Firestore
): Promise<AiModelConfig> {
  const now = Date.now();
  if (cached && now - cached.cachedAt < READ_CACHE_TTL_MS) return cached.value;
  try {
    const doc = await db
      .collection('global_permissions')
      .doc('gemini-functions')
      .get();
    const cfg = (doc.data()?.config ?? {}) as StoredConfig;
    const value: AiModelConfig = {
      advancedModel:
        normalizeModelName(cfg.advancedModel) ?? DEFAULT_ADVANCED_MODEL,
      standardModel:
        normalizeModelName(cfg.standardModel) ?? DEFAULT_STANDARD_MODEL,
      integrationModels: parseIntegrationModels(
        cfg.integrationModels,
        cfg.allowedModels
      ),
      usedFallback: false,
    };
    cached = { value, cachedAt: now };
    return value;
  } catch (error) {
    console.warn(
      'Failed to read AI model config from Firestore; using defaults.',
      error
    );
    // Not cached, so a transient error doesn't pin defaults for 5 minutes.
    return {
      advancedModel: DEFAULT_ADVANCED_MODEL,
      standardModel: DEFAULT_STANDARD_MODEL,
      integrationModels: {},
      usedFallback: true,
    };
  }
}

/** The Gemini tier models only, for callers that predate per-integration routing. */
export async function getGeminiModelConfig(
  db: admin.firestore.Firestore
): Promise<{
  advancedModel: string;
  standardModel: string;
  usedFallback: boolean;
}> {
  const { advancedModel, standardModel, usedFallback } =
    await getAiModelConfig(db);
  return { advancedModel, standardModel, usedFallback };
}
