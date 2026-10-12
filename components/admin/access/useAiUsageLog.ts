import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { CLAUDE_MODELS } from '@/config/aiModels';

export interface AiIntegrationUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  fallbacks: number;
  errors: number;
  /** Calls per model id. */
  byModel: Record<string, number>;
  /** Tokens per model id, for a cost estimate. */
  tokensByModel: Record<string, { input: number; output: number }>;
}

export const USAGE_WINDOW_DAYS = 30;

/** Claude spend from token counts; Gemini is billed through Google Cloud. */
export const claudeCost = (usage: AiIntegrationUsage | undefined): number => {
  if (!usage) return 0;
  return Object.entries(usage.tokensByModel).reduce((sum, [model, t]) => {
    const price = CLAUDE_MODELS.find((m) => m.id === model)?.price;
    return price
      ? sum + (t.input * price.input + t.output * price.output) / 1_000_000
      : sum;
  }, 0);
};

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** Sums `ai_call_log` rows from the last 30 days by integration. */
export const summarizeCallLog = (
  rows: Record<string, unknown>[]
): Record<string, AiIntegrationUsage> => {
  const out: Record<string, AiIntegrationUsage> = {};
  for (const row of rows) {
    const id = typeof row.integration === 'string' ? row.integration : '';
    const model = typeof row.model === 'string' ? row.model : '';
    if (!id || !model) continue;
    const u = (out[id] ??= {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      fallbacks: 0,
      errors: 0,
      byModel: {},
      tokensByModel: {},
    });
    u.calls += num(row.calls);
    u.inputTokens += num(row.inputTokens);
    u.outputTokens += num(row.outputTokens);
    u.fallbacks += num(row.fallbacks);
    u.errors += num(row.errors);
    u.byModel[model] = (u.byModel[model] ?? 0) + num(row.calls);
    const t = (u.tokensByModel[model] ??= { input: 0, output: 0 });
    t.input += num(row.inputTokens);
    t.output += num(row.outputTokens);
  }
  return out;
};

/** Last-30-day AI usage per integration, and whether a Claude key is stored. */
export const useAiUsageLog = () => {
  const [usage, setUsage] = useState<Record<string, AiIntegrationUsage>>({});
  const [claudeConfigured, setClaudeConfigured] = useState<boolean | null>(
    null
  );

  useEffect(() => {
    if (isAuthBypass) return;
    let cancelled = false;
    const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    getDocs(query(collection(db, 'ai_call_log'), where('date', '>=', since)))
      .then((snap) => {
        if (!cancelled)
          setUsage(summarizeCallLog(snap.docs.map((d) => d.data())));
      })
      .catch((err: unknown) => logError('aiCallLog.load', err));
    httpsCallable<void, { claudeConfigured: boolean }>(
      functions,
      'getAiProviderStatusV1'
    )()
      .then((res) => {
        if (!cancelled) setClaudeConfigured(res.data.claudeConfigured);
      })
      .catch((err: unknown) => logError('aiProviderStatus.load', err));
    return () => {
      cancelled = true;
    };
  }, []);

  return { usage, claudeConfigured };
};
