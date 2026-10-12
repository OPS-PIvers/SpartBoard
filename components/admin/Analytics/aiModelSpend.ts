import { estimateAiCost, providerOf, type AiProvider } from '@/config/aiModels';

export interface AiModelSpendRow {
  model: string;
  provider: AiProvider;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Gemini calls that answered after a Claude attempt failed. */
  fallbacks: number;
  errors: number;
  cost: number;
}

export interface AiSpendDay {
  date: string;
  /** Estimated USD per model id that day. */
  byModel: Record<string, number>;
  total: number;
}

export interface AiModelSpendSummary {
  models: AiModelSpendRow[];
  days: AiSpendDay[];
  totalCost: number;
  totalCalls: number;
  costByProvider: Record<AiProvider, number>;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** Adds `ai_call_log` rows up by model and by day, pricing each row at its own date. */
export const summarizeModelSpend = (
  rows: Record<string, unknown>[]
): AiModelSpendSummary => {
  const models = new Map<string, AiModelSpendRow>();
  const days = new Map<string, AiSpendDay>();
  const costByProvider: Record<AiProvider, number> = { gemini: 0, claude: 0 };
  let totalCost = 0;
  let totalCalls = 0;

  for (const row of rows) {
    const model = typeof row.model === 'string' ? row.model : '';
    const date = typeof row.date === 'string' ? row.date : '';
    if (!model || !date) continue;
    const inputTokens = num(row.inputTokens);
    const outputTokens = num(row.outputTokens);
    const calls = num(row.calls);
    const cost = estimateAiCost(model, date, inputTokens, outputTokens);
    const provider = providerOf(model);

    let m = models.get(model);
    if (!m) {
      m = {
        model,
        provider,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        fallbacks: 0,
        errors: 0,
        cost: 0,
      };
      models.set(model, m);
    }
    m.calls += calls;
    m.inputTokens += inputTokens;
    m.outputTokens += outputTokens;
    m.fallbacks += num(row.fallbacks);
    m.errors += num(row.errors);
    m.cost += cost;

    let d = days.get(date);
    if (!d) {
      d = { date, byModel: {}, total: 0 };
      days.set(date, d);
    }
    d.byModel[model] = (d.byModel[model] ?? 0) + cost;
    d.total += cost;

    costByProvider[provider] += cost;
    totalCost += cost;
    totalCalls += calls;
  }

  return {
    models: [...models.values()].sort(
      (a, b) => b.cost - a.cost || b.calls - a.calls
    ),
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    totalCost,
    totalCalls,
    costByProvider,
  };
};

/** Every date from `since` through `until` (YYYY-MM-DD), filling gaps so the chart has no holes. */
export const fillSpendDays = (
  days: AiSpendDay[],
  since: string,
  until: string
): AiSpendDay[] => {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out: AiSpendDay[] = [];
  const cursor = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    out.push(byDate.get(date) ?? { date, byModel: {}, total: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

export const formatUsd = (value: number): string =>
  value > 0 && value < 0.01
    ? '<$0.01'
    : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
