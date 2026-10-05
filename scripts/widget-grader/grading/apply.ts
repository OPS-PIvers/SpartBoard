// Writes grades back into scorecards: Paul's clicks from the artifact db (R2, R27) and script/judge scores where Paul has none.

import type {
  CriterionId,
  CriterionScore,
  Level,
  Scorecard,
} from '../types.ts';
import type { DeckCard, GradeRow, GradingDeck } from './types.ts';

export interface CalibrationExample {
  widgetType: string;
  criterionId: CriterionId;
  paul: Level;
  judge: Level | null;
  script: Level | null;
  note?: string;
  missed?: string;
  rubricVersion: string;
  gradedAt: string;
  runId: string;
  deckId: string;
}

export interface RewriteCandidate {
  criterionId: CriterionId;
  widgetType: string;
  paul: Level;
  judge: Level;
  missed: string;
}

export type Exemplars = Partial<
  Record<CriterionId, Partial<Record<`${Level}`, string>>>
>;

export interface ApplyResult {
  scorecards: Record<string, Scorecard>;
  examples: CalibrationExample[];
  rewrites: RewriteCandidate[];
  exemplars: Exemplars;
  /** Card ids with a row that matched no card, or a level the criterion does not define. */
  rejected: string[];
}

const REWRITE_GAP = 2;

const emptyCard = (widgetType: string, version: string): Scorecard => ({
  $schema: '../scorecard.schema.json',
  widgetType,
  rubricVersion: version,
  gradedAt: null,
  stale: false,
  criteria: {},
  gates: {},
});

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const evidence = (deck: GradingDeck, card: DeckCard) => ({
  ...(card.shots.length ? { screenshots: card.shots.map((s) => s.from) } : {}),
  runId: deck.runId,
});

const candidates = (
  card: DeckCard,
  prior: CriterionScore | undefined
): NonNullable<CriterionScore['candidates']> => ({
  ...prior?.candidates,
  script: card.scriptLevel,
  ...(card.judge ? { judge: card.judge.score } : {}),
});

/** Records gates and N/A by rule for every widget in the deck. */
function recordDeckFacts(
  deck: GradingDeck,
  cards: Record<string, Scorecard>,
  now: string
): void {
  for (const [type, gates] of Object.entries(deck.gates)) {
    const sc = (cards[type] ??= emptyCard(type, deck.rubricVersion));
    for (const g of gates)
      sc.gates[g.gate] = {
        pass: g.pass,
        evidence: { runId: deck.runId },
        gradedAt: now,
      };
  }
  for (const card of deck.cards) {
    if (!card.na) continue;
    const sc = (cards[card.widgetType] ??= emptyCard(
      card.widgetType,
      deck.rubricVersion
    ));
    sc.criteria[card.criterionId] = {
      score: null,
      source: 'script',
      note: 'N/A by rule',
      rubricVersion: deck.rubricVersion,
      gradedAt: now,
      stale: false,
    };
  }
}

const touch = (sc: Scorecard, deck: GradingDeck, now: string) => {
  sc.gradedAt = now;
  sc.rubricVersion = deck.rubricVersion;
  sc.stale = false;
};

/** Paul's grades win (R2); every one becomes a calibration example, and a 2+ gap with the judge is a rewrite candidate. */
export function applyPaulGrades(
  deck: GradingDeck,
  rows: GradeRow[],
  scorecards: Record<string, Scorecard>,
  now: string,
  exemplars: Exemplars = {}
): ApplyResult {
  const cards = clone(scorecards);
  const outExemplars = clone(exemplars);
  const byId = new Map(deck.cards.map((c) => [c.id, c]));
  const examples: CalibrationExample[] = [];
  const rewrites: RewriteCandidate[] = [];
  const rejected: string[] = [];
  recordDeckFacts(deck, cards, now);
  const touched = new Set(Object.keys(deck.gates));

  for (const row of rows) {
    const card = byId.get(row.cardId);
    if (!card || card.na || !card.levels.some((l) => l.level === row.level)) {
      rejected.push(row.cardId);
      continue;
    }
    const sc = (cards[card.widgetType] ??= emptyCard(
      card.widgetType,
      deck.rubricVersion
    ));
    const prior = sc.criteria[card.criterionId];
    const note = [row.note?.trim(), row.missed?.trim()]
      .filter(Boolean)
      .join(' | ');
    sc.criteria[card.criterionId] = {
      score: row.level,
      source: 'paul',
      candidates: { ...candidates(card, prior), paul: row.level },
      evidence: evidence(deck, card),
      ...(note ? { note } : {}),
      rubricVersion: deck.rubricVersion,
      gradedAt: row.gradedAt,
      stale: false,
    };
    touched.add(card.widgetType);
    const judge = card.judge?.score ?? null;
    examples.push({
      widgetType: card.widgetType,
      criterionId: card.criterionId,
      paul: row.level,
      judge,
      script: card.scriptLevel,
      ...(row.note?.trim() ? { note: row.note.trim() } : {}),
      ...(row.missed?.trim() ? { missed: row.missed.trim() } : {}),
      rubricVersion: deck.rubricVersion,
      gradedAt: row.gradedAt,
      runId: deck.runId,
      deckId: deck.deckId,
    });
    if (judge !== null && Math.abs(judge - row.level) >= REWRITE_GAP)
      rewrites.push({
        criterionId: card.criterionId,
        widgetType: card.widgetType,
        paul: row.level,
        judge,
        missed: row.missed?.trim() ?? '',
      });
    if (row.exemplar && card.exemplarPick)
      (outExemplars[card.criterionId] ??= {})[`${row.level}`] = card.widgetType;
  }
  for (const type of touched) touch(cards[type], deck, now);
  return {
    scorecards: cards,
    examples,
    rewrites,
    exemplars: outExemplars,
    rejected,
  };
}

/** Script or judge scores for criteria Paul has not graded; a script level wins over the judge where both exist. */
export function applyAutomaticScores(
  deck: GradingDeck,
  scorecards: Record<string, Scorecard>,
  now: string
): Record<string, Scorecard> {
  const cards = clone(scorecards);
  recordDeckFacts(deck, cards, now);
  const touched = new Set(Object.keys(deck.gates));
  for (const card of deck.cards) {
    if (card.na) continue;
    const sc = (cards[card.widgetType] ??= emptyCard(
      card.widgetType,
      deck.rubricVersion
    ));
    const prior = sc.criteria[card.criterionId];
    if (prior?.source === 'paul' && !prior.stale) continue;
    const judge = card.judge?.score ?? null;
    const source = card.scriptLevel !== null ? 'script' : 'judge';
    const score = card.scriptLevel ?? judge;
    if (score === null) continue;
    sc.criteria[card.criterionId] = {
      score,
      source,
      candidates: candidates(card, prior),
      evidence: evidence(deck, card),
      ...(source === 'judge' && card.judge?.why
        ? { note: card.judge.why }
        : {}),
      rubricVersion: deck.rubricVersion,
      gradedAt: now,
      stale: false,
    };
    touched.add(card.widgetType);
  }
  for (const type of touched) touch(cards[type], deck, now);
  return cards;
}
