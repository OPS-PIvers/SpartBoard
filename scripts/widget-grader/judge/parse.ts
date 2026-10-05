// Parses and validates the judge's JSON answer against the levels each criterion allows.

import type { CriterionId, Level } from '../types.ts';
import type { JudgeScore } from '../grading/types.ts';

export interface JudgeResult {
  widgetType: string;
  scores: Partial<Record<CriterionId, JudgeScore>>;
}

export interface ParsedJudge {
  result: JudgeResult | null;
  errors: string[];
}

const lastJsonBlock = (text: string): string => {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  return (blocks.length ? blocks[blocks.length - 1][1] : text).trim();
};

export function parseJudgeOutput(
  text: string,
  widgetType: string,
  allowed: Map<CriterionId, Level[]>
): ParsedJudge {
  let raw: unknown;
  try {
    raw = JSON.parse(lastJsonBlock(text));
  } catch (e) {
    return { result: null, errors: [`not JSON: ${(e as Error).message}`] };
  }
  const body = raw as { widgetType?: unknown; scores?: unknown };
  if (!body || typeof body.scores !== 'object' || body.scores === null)
    return { result: null, errors: ['missing "scores" object'] };
  const errors: string[] = [];
  if (body.widgetType !== widgetType)
    errors.push(
      `widgetType is ${String(body.widgetType)}, expected ${widgetType}`
    );
  const scores: JudgeResult['scores'] = {};
  const given = body.scores as Record<
    string,
    { level?: unknown; why?: unknown }
  >;
  for (const [id, levels] of allowed) {
    const entry = given[id];
    if (!entry) {
      errors.push(`${id}: missing`);
      continue;
    }
    const level = entry.level;
    if (level === null || level === 'N/A' || level === 'NA') {
      errors.push(`${id}: the judge cannot mark N/A (R15)`);
      continue;
    }
    if (typeof level !== 'number' || !levels.includes(level as Level)) {
      errors.push(
        `${id}: level ${String(level)} is not one of ${levels.join(', ')}`
      );
      continue;
    }
    scores[id] = {
      score: level as Level,
      why: typeof entry.why === 'string' ? entry.why.trim() : '',
    };
  }
  for (const id of Object.keys(given))
    if (!allowed.has(id as CriterionId)) errors.push(`${id}: not asked for`);
  return { result: { widgetType, scores }, errors };
}
