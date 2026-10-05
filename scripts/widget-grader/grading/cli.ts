// /grade-widget steps. Run from the repo root:
//   node scripts/widget-grader/grading/cli.ts judge-prompt --run <runId> --type clock,poll [--exclude a,b] [--criteria V1,V2]
//   node scripts/widget-grader/grading/cli.ts judge-check  --run <runId> --type clock --answer <file> [--out <file>]
//   node scripts/widget-grader/grading/cli.ts deck   --run <runId> --mode widget|criterion|disagreements [--criterion V2] [--type a,b]
//   node scripts/widget-grader/grading/cli.ts apply  --run <runId> --deck <deckId> --rows <rows folder or file>
//   node scripts/widget-grader/grading/cli.ts record --run <runId> --deck <deckId>

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CriterionId, Measurement, Rubric, Scorecard } from '../types.ts';
import { resolveWidgetFiles } from '../widgetFiles.ts';
import { buildJudgePrompt, judgedCriteria } from '../judge/prompt.ts';
import { parseJudgeOutput, type JudgeResult } from '../judge/parse.ts';
import { readExamples } from '../calibration/check.ts';
import { buildDeck, type WidgetInput } from './deck.ts';
import {
  applyAutomaticScores,
  applyPaulGrades,
  type Exemplars,
} from './apply.ts';
import { parseGradeRows } from './rows.ts';
import type { GradingDeck, GradingMode } from './types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const RUBRIC_DIR = join(ROOT, 'docs/widget-rubric');
const OUT = join(ROOT, 'scripts/widget-grader/out');
const PAGE = join(ROOT, '.claude/skills/grade-widget/page/index.html');

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const writeJson = (p: string, v: unknown) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
};

/** Widget display names from config/tools.ts, read as text so no app code loads here. */
export function toolLabels(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(
    /type:\s*'([^']+)',[\s\S]{0,200}?label:\s*'((?:[^'\\]|\\.)+)'/g
  ))
    out[m[1]] ??= m[2].replace(/\\'/g, "'");
  return out;
}

function loadWidgets(runId: string, types: string[]): WidgetInput[] {
  const measured = join(OUT, runId, 'measurements');
  if (!existsSync(measured)) throw new Error(`no measurements in ${measured}`);
  const all = readdirSync(measured)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
  const chosen = types.length ? types.filter((t) => all.includes(t)) : all;
  const missing = types.filter((t) => !all.includes(t));
  if (missing.length)
    console.warn(`not in run ${runId}: ${missing.join(', ')}`);
  const labels = toolLabels(
    readFileSync(join(ROOT, 'config/tools.ts'), 'utf8')
  );
  const files = resolveWidgetFiles(ROOT);
  return chosen.sort().map((type) => {
    const staticPath = join(OUT, 'static', `${type}.json`);
    const judgePath = join(OUT, runId, 'judge', `${type}.json`);
    const scorecardPath = join(RUBRIC_DIR, 'scorecards', `${type}.json`);
    const measurements = [
      ...readJson<Measurement[]>(join(measured, `${type}.json`)),
      ...(existsSync(staticPath) ? readJson<Measurement[]>(staticPath) : []),
    ];
    return {
      type,
      name: labels[type] ?? type,
      measurements,
      hasSettings: (files[type]?.settings.length ?? 0) > 0,
      scorecard: existsSync(scorecardPath)
        ? readJson<Scorecard>(scorecardPath)
        : undefined,
      judge: existsSync(judgePath)
        ? readJson<JudgeResult>(judgePath).scores
        : undefined,
    };
  });
}

/** A JSON file, or a folder of one JSON file per row (ArtifactData list with out_dir). */
function readRows(path: string): unknown {
  if (!statSync(path).isDirectory()) return readJson<unknown>(path);
  return readdirSync(path, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson<unknown>(join(path, f)));
}

const deckPath = (runId: string, deckId: string) =>
  join(OUT, runId, 'publish', deckId, 'deck.json');

function writeScorecards(cards: Record<string, Scorecard>) {
  for (const [type, card] of Object.entries(cards))
    writeJson(join(RUBRIC_DIR, 'scorecards', `${type}.json`), card);
}

function main(argv: string[]): void {
  const [cmd, ...rest] = argv.filter((a) => a !== '--');
  const opt = (name: string): string | undefined => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const list = (name: string): string[] =>
    (opt(name) ?? '').split(',').filter(Boolean);
  const runId = opt('run');
  if (!runId) throw new Error('--run <runId> is required');
  const rubric = readJson<Rubric>(join(RUBRIC_DIR, 'rubric.json'));
  const now = new Date().toISOString();

  if (cmd === 'judge-prompt') {
    const examples = readExamples(
      join(RUBRIC_DIR, 'calibration/examples.jsonl')
    );
    for (const w of loadWidgets(runId, list('type'))) {
      const path = join(OUT, runId, 'judge', `${w.type}.prompt.md`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        buildJudgePrompt({
          rubric,
          widget: w,
          examples,
          exclude: list('exclude'),
          criteria: list('criteria').length
            ? (list('criteria') as CriterionId[])
            : undefined,
        })
      );
      console.log(path);
    }
    return;
  }

  if (cmd === 'judge-check') {
    const [w] = loadWidgets(runId, list('type'));
    const answer = opt('answer');
    if (!w || !answer) throw new Error('--type <one type> and --answer <file>');
    const allowed = new Map(
      judgedCriteria(
        rubric,
        w,
        list('criteria').length
          ? (list('criteria') as CriterionId[])
          : undefined
      ).map((j) => [j.criterion.id, j.levels])
    );
    const { result, errors } = parseJudgeOutput(
      readFileSync(resolve(ROOT, answer), 'utf8'),
      w.type,
      allowed
    );
    if (errors.length || !result) {
      console.error(errors.join('\n'));
      process.exit(1);
    }
    const out = opt('out') ?? join(OUT, runId, 'judge', `${w.type}.json`);
    writeJson(resolve(ROOT, out), result);
    console.log(out);
    return;
  }

  if (cmd === 'deck') {
    const mode = (opt('mode') ?? 'widget') as GradingMode;
    const exemplarsPath = join(RUBRIC_DIR, 'calibration/exemplars.json');
    const deckId = opt('deck') ?? `${mode}-${now.replace(/[:.]/g, '-')}`;
    const deck = buildDeck({
      rubric,
      mode,
      criterion: opt('criterion') as CriterionId | undefined,
      widgets: loadWidgets(runId, list('type')),
      exemplars: existsSync(exemplarsPath)
        ? readJson<Exemplars>(exemplarsPath)
        : undefined,
      deckId,
      runId,
      createdAt: now,
    });
    const dir = dirname(deckPath(runId, deckId));
    const files: Record<string, string> = { 'deck.json': 'deck.json' };
    for (const card of deck.cards)
      for (const s of [...card.shots, ...card.exemplars]) {
        const to = join(dir, s.src);
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(join(ROOT, s.from), to);
        files[s.src] = s.src;
      }
    writeJson(join(dir, 'deck.json'), deck);
    copyFileSync(PAGE, join(dir, 'index.html'));
    writeJson(join(dir, 'files.json'), files);
    console.log(
      `${deck.cards.length} cards, ${Object.keys(files).length - 1} screenshots\npublish ${join(dir, 'index.html')} with root ${dir} and files ${join(dir, 'files.json')}`
    );
    return;
  }

  if (cmd === 'apply' || cmd === 'record') {
    const deckId = opt('deck');
    if (!deckId) throw new Error('--deck <deckId> is required');
    const deck = readJson<GradingDeck>(deckPath(runId, deckId));
    const types = Object.keys(deck.gates);
    const current: Record<string, Scorecard> = {};
    for (const t of types) {
      const p = join(RUBRIC_DIR, 'scorecards', `${t}.json`);
      if (existsSync(p)) current[t] = readJson<Scorecard>(p);
    }
    if (cmd === 'record') {
      writeScorecards(applyAutomaticScores(deck, current, now));
      console.log(`recorded script and judge scores for ${types.join(', ')}`);
      return;
    }
    const rowsPath = opt('rows');
    if (!rowsPath) throw new Error('--rows <file> is required');
    const exemplarsPath = join(RUBRIC_DIR, 'calibration/exemplars.json');
    const result = applyPaulGrades(
      deck,
      parseGradeRows(readRows(resolve(ROOT, rowsPath))),
      current,
      now,
      existsSync(exemplarsPath) ? readJson<Exemplars>(exemplarsPath) : {}
    );
    writeScorecards(result.scorecards);
    const cal = join(RUBRIC_DIR, 'calibration');
    const append = (file: string, rows: unknown[]) => {
      if (!rows.length) return;
      const p = join(cal, file);
      const prev = existsSync(p) ? readFileSync(p, 'utf8') : '';
      writeFileSync(
        p,
        prev + rows.map((r) => `${JSON.stringify(r)}\n`).join('')
      );
    };
    append('examples.jsonl', result.examples);
    append(
      'rewrites.jsonl',
      result.rewrites.map((r) => ({ ...r, deckId, gradedAt: now }))
    );
    if (Object.keys(result.exemplars).length)
      writeJson(exemplarsPath, result.exemplars);
    console.log(
      [
        `${result.examples.length} grades written for ${types.join(', ')}`,
        result.rejected.length ? `rejected: ${result.rejected.join(', ')}` : '',
        ...result.rewrites.map(
          (r) =>
            `rewrite candidate ${r.criterionId} (${r.widgetType}): Paul ${r.paul}, judge ${r.judge}. ${r.missed}`
        ),
      ]
        .filter(Boolean)
        .join('\n')
    );
    return;
  }

  throw new Error(`unknown command ${cmd}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2));
