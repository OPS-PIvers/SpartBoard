// Turns saved MDE items into SpartBoard question banks, a stimulus per tab and a run report (plan M33).
import { createHash } from 'node:crypto';
import { slug, text } from './html.mjs';
import { itemMeta, parseItem } from './parse.mjs';

// Mirrors FIB_BLANK_SEP in utils/quizFibBlanks.ts: joins one answer per blank.
export const FIB_BLANK_SEP = '\u001F';

/** The question fields from the not-yet-merged Quiz PRs; rename here only. */
export const NEW_FIELDS = {
  blankType: 'blankType',
  blankChoices: 'blankChoices',
  wordBank: 'wordBank',
  wordBankReuse: 'wordBankReuse',
  explanation: 'explanation',
  optionExplanations: 'optionExplanations',
  dok: 'dok',
  tabLabel: 'tabLabel',
};

const STANDARD_SETS = { Science: 'mn-sci-2019' };

/** Same input, same id, so a newer package updates the same items (M31). */
export const stableId = (...parts) => {
  const h = createHash('sha1').update(`spartboard-mca:${parts.join(':')}`);
  const b = h.digest();
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
};

const attribution = (naepId) =>
  `Minnesota Department of Education, released MCA item ${naepId}`;

const picName = (imgId, ext) =>
  `fig-${imgId.slice(0, 8)}.${ext === 'svg' || ext === 'bin' ? 'png' : ext}`;

/** Mapping of an MDE rubric table to a one-row rubric (levels low to high). */
const rubricFrom = (spec, id, title, now) => {
  const levels = spec.rubric.levels;
  return {
    id,
    title,
    criteria: [
      {
        id: stableId(id, 'overall'),
        name: 'Overall response',
        description: 'MDE holistic rubric',
        levels: levels.map((l) => ({
          id: stableId(id, 'level', l.score),
          label: `Score ${l.score}`,
          points: l.score,
          description: l.text,
        })),
        guide: {
          examples: levels
            .filter((l) => l.sample)
            .map((l) => `Score ${l.score}: ${l.sample}`),
        },
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
};

const blankCount = (t) => t.match(/_{2,}/g)?.length ?? 0;

/** Builds the SpartBoard question for one spec, or throws a reason the item cannot be kept. */
export function specToQuestion(spec, ctx) {
  const id = stableId('question', ctx.item.itemTableId, spec.part ?? '');
  const q = {
    id,
    timeLimit: 0,
    text: spec.text,
    correctAnswer: '',
    incorrectAnswers: [],
    points: 1,
    stimulusIds: ctx.stimulusIds,
  };
  if (ctx.targets.length) q.targets = ctx.targets;
  if (ctx.item.difficulty) q[NEW_FIELDS.dok] = Number(ctx.item.difficulty);
  if (spec.explanation) q[NEW_FIELDS.explanation] = spec.explanation;
  if (spec.kind === 'mc' || spec.kind === 'ma') {
    const multi = spec.kind === 'ma';
    const right = spec.options.filter((_, i) =>
      multi ? spec.correct[i] : i === spec.correct
    );
    const wrong = spec.options.filter((_, i) =>
      multi ? !spec.correct[i] : i !== spec.correct
    );
    if ([...right, ...wrong].some((o) => /\|/.test(o) && multi)) {
      throw new Error('An option contains "|", which a multiple-answer key cannot hold');
    }
    q.type = multi ? 'MA' : 'MC';
    q.correctAnswer = right.join('|');
    q.incorrectAnswers = wrong;
    const why = {};
    spec.options.forEach((o, i) => {
      if (spec.optionExplanations?.[i]) why[o] = spec.optionExplanations[i];
    });
    if (Object.keys(why).length) q[NEW_FIELDS.optionExplanations] = why;
  } else if (spec.kind === 'fib') {
    q.type = 'FIB';
    if (blankCount(spec.text) !== spec.answers.length) {
      throw new Error(
        `${blankCount(spec.text)} blanks in the text but ${spec.answers.length} answers`
      );
    }
    q.correctAnswer = spec.answers.join(FIB_BLANK_SEP);
    q[NEW_FIELDS.blankType] = spec.blankType;
    if (spec.alternates?.some((a) => a.length)) {
      q.blankAlternates = spec.answers.map((_, i) => ({
        answers: spec.alternates[i] ?? [],
      }));
    }
    if (spec.blankType === 'dropdown') {
      q[NEW_FIELDS.blankChoices] = spec.choices.map((c) => ({ choices: c }));
      spec.answers.forEach((a, i) => {
        if (!spec.choices[i].includes(a)) {
          throw new Error(`Blank ${i + 1}: key "${a}" is not among its choices`);
        }
      });
    } else {
      q[NEW_FIELDS.wordBank] = spec.bank;
      q[NEW_FIELDS.wordBankReuse] = Boolean(spec.reuse);
      spec.answers.forEach((a, i) => {
        if (!spec.bank.includes(a)) {
          throw new Error(`Blank ${i + 1}: key "${a}" is not in the word bank`);
        }
      });
    }
  } else if (spec.kind === 'matching') {
    q.type = 'Matching';
    if (spec.pairs.some((p) => p.some((s) => /[:|]/.test(s)))) {
      throw new Error('A matching term contains ":" or "|", which the key cannot hold');
    }
    q.correctAnswer = spec.pairs.map(([t, d]) => `${t}:${d}`).join('|');
    if (spec.distractors?.length) q.matchingDistractors = spec.distractors;
  } else if (spec.kind === 'fr') {
    q.type = 'free-response';
    if (spec.rubric) {
      const title = `MCA ${ctx.title}: item ${ctx.item.naepId}`;
      q.rubricSnapshot = rubricFrom(spec, stableId('rubric', ctx.item.itemTableId), title, ctx.now);
      q.points = Math.max(...spec.rubric.levels.map((l) => l.score));
    }
  } else {
    throw new Error(`Unknown spec kind ${spec.kind}`);
  }
  return q;
}

const targetsFor = (item, subject, catalog) => {
  const tags = [];
  const set = STANDARD_SETS[subject];
  if (item.standard && set) {
    const b = catalog.get(item.standard);
    tags.push({
      id: `${set}:${item.standard}`,
      kind: 'standard',
      code: item.standard,
      label: b?.text ?? item.standard,
    });
  }
  if (item.contentArea) {
    const label = item.contentArea.trim();
    tags.push({ id: `mca-practice:${slug(label)}`, kind: 'personal', label });
  }
  return tags;
};

/**
 * @param {object} input
 * @param {object[]} input.items saved items (list row + details + guide + tabSetId + hasChart)
 * @param {Record<string, object>} input.tabsets saved tab sets keyed by id
 * @param {Record<string, {ext: string}>} input.imageIndex downloaded pictures keyed by MDE id
 * @param {Record<string, object>} input.overrides hand conversions keyed by itemTableId
 * @param {Map<string, {text: string}>} input.catalog standards catalog keyed by benchmark code
 * @param {{ test: string, subject: string, grade: string, now: number }} input.meta
 */
export function convertItems({
  items,
  tabsets,
  imageIndex,
  overrides,
  catalog,
  meta,
}) {
  const collection = `${meta.test} ${meta.subject} Grade ${meta.grade}`;
  const sets = new Map();
  const setFor = (key) => {
    if (!sets.has(key)) {
      const t = tabsets[key];
      sets.set(key, {
        key,
        title: t?.tabSetTitle ?? 'No stimulus',
        tabs: t
          ? [...t.tabs]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((tab) => ({
                id: tab.tabId,
                title: tab.tabTitle,
                html: tab.itemContent,
              }))
          : [],
        questions: [],
        entries: [],
        year: '',
      });
    }
    return sets.get(key);
  };
  const figures = new Map();
  const charts = [];
  const report = [];

  for (const item of items) {
    const set = setFor(item.tabSetId ?? 'none');
    const im = itemMeta(item);
    const row = {
      itemTableId: item.itemTableId,
      naepId: item.naepId,
      mdeType: item.type,
      reference: im.ref,
    };
    const hand = overrides[item.itemTableId];
    const parsed = parseItem(item);
    let specs;
    let how = 'parsed';
    if (hand?.questions) {
      specs = hand.questions;
      how = 'override';
    } else if (parsed.ok) {
      specs = parsed.specs;
      if (hand?.keepImages) {
        specs = specs.map((s) => ({
          ...s,
          images: hand.keepImages.map((i) => parsed.bodyImages[i]),
        }));
        how = 'parsed + picture override';
      }
    } else {
      report.push({ ...row, status: 'not-converted', reason: parsed.reason });
      continue;
    }
    try {
      const stimuli = [];
      const stimulusIds = set.tabs.map((tab) => stableId('tab', set.key, tab.id));
      const targets = targetsFor(item, meta.subject, catalog);
      const questions = specs.map((spec, n) => {
        const ids = [...stimulusIds];
        const figureStimuli = [];
        const picks = (spec.images ?? []).map((i) =>
          typeof i === 'number' ? parsed.bodyImages[i] : i
        );
        for (const img of picks.filter((i) => i?.id)) {
          const ext = imageIndex[img.id]?.ext;
          if (!ext) throw new Error(`Picture ${img.id} was not downloaded`);
          if (!figures.has(img.id)) {
            figures.set(img.id, { file: picName(img.id, ext), imgId: img.id, ext });
          }
          const fid = stableId('figure', item.itemTableId, img.id, n);
          ids.push(fid);
          figureStimuli.push({
            id: fid,
            type: 'image',
            url: `pictures/${figures.get(img.id).file}`,
            label: `Item ${item.naepId} figure`,
            ...(img.alt
              ? { readAloudText: img.alt, readAloudSource: 'edited' }
              : {}),
          });
        }
        const q = specToQuestion(spec, {
          item,
          stimulusIds: ids,
          targets,
          title: collection,
          now: meta.now,
        });
        stimuli.push(...figureStimuli);
        return q;
      });
      set.year ||= im.year;
      set.questions.push({ num: im.num, questions, stimuli });
      for (const q of questions) {
        set.entries.push({
          id: q.id,
          itemTableId: item.itemTableId,
          naepId: item.naepId,
          attribution: attribution(item.naepId),
          resultsPicture: item.hasChart ? `pictures/chart-${item.itemTableId}.png` : null,
        });
      }
      if (item.hasChart) {
        charts.push({
          file: `chart-${item.itemTableId}.png`,
          itemTableId: item.itemTableId,
        });
      }
      const notes = specs.flatMap((s) => s.review ?? []);
      report.push({
        ...row,
        status: notes.length || how !== 'parsed' ? 'converted-check' : 'converted',
        becomes: specs.map((s) => s.kind),
        how,
        notes,
      });
    } catch (err) {
      report.push({ ...row, status: 'not-converted', reason: err.message });
    }
  }

  const banks = [];
  const tabPictures = [];
  for (const set of sets.values()) {
    if (!set.questions.length) continue;
    const ordered = [...set.questions].sort((a, b) => a.num - b.num);
    const tabStimuli = set.tabs.map((tab) => {
      const file = `${slug(collection)}-${slug(set.title)}-${slug(tab.title)}.png`;
      tabPictures.push({
        file,
        title: set.tabs.length > 1 ? `${set.title}: ${tab.title}` : set.title,
        html: tab.html,
      });
      const words = text(tab.html);
      return {
        id: stableId('tab', set.key, tab.id),
        type: 'image',
        url: `pictures/${file}`,
        label: `${set.title}: ${tab.title}`,
        [NEW_FIELDS.tabLabel]: tab.title,
        ...(words ? { readAloudText: words, readAloudSource: 'edited' } : {}),
      };
    });
    const title = `${collection}: ${set.title}${set.year ? ` (${set.year})` : ''}`;
    const id = stableId('bank', meta.test, meta.subject, meta.grade, set.key);
    const files = [
      ...tabStimuli.map((s) => s.url),
      ...ordered.flatMap((o) => o.stimuli.map((s) => s.url)),
    ];
    banks.push({
      id,
      title,
      pictures: [...new Set(files)],
      bank: {
        id,
        title,
        questions: ordered.flatMap((o) => o.questions),
        stimuli: [...tabStimuli, ...ordered.flatMap((o) => o.stimuli)],
        language: 'en-US',
        createdAt: meta.now,
        updatedAt: meta.now,
      },
      entries: set.entries,
    });
  }
  banks.sort((a, b) => a.title.localeCompare(b.title));

  return {
    collection,
    banks,
    report,
    pictures: {
      tabs: tabPictures,
      figures: [...figures.values()],
      charts,
    },
  };
}

/** Checks the run against what the plan asks of a package (M34); returns problems, empty when sound. */
export function validateRun(result, listed) {
  const problems = [];
  const seen = new Set(result.report.map((r) => String(r.itemTableId)));
  for (const item of listed) {
    if (!seen.has(String(item.itemTableId))) {
      problems.push(`Item ${item.itemTableId} is neither converted nor reported`);
    }
  }
  const known = new Set([
    ...result.pictures.tabs.map((t) => `pictures/${t.file}`),
    ...result.pictures.figures.map((f) => `pictures/${f.file}`),
  ]);
  const ids = new Set();
  for (const b of result.banks) {
    for (const q of b.bank.questions) {
      if (ids.has(q.id)) problems.push(`Duplicate question id ${q.id}`);
      ids.add(q.id);
      if (q.type !== 'free-response' && !q.correctAnswer) {
        problems.push(`Question ${q.id} in "${b.title}" has no key`);
      }
    }
    for (const s of b.bank.stimuli) {
      if (!known.has(s.url)) problems.push(`Missing picture ${s.url} in "${b.title}"`);
    }
  }
  return problems;
}

/** Plain-text run report: what mapped, what needs a human, what was left out. */
export function reportMarkdown(result, problems, meta) {
  const by = (s) => result.report.filter((r) => r.status === s);
  const lines = [
    `# ${result.collection}: package run report`,
    '',
    `Source: Minnesota Questions Tool, test type ${meta.testTypeId}, subject ${meta.subjectId}, grade ${meta.grade}.`,
    `Items listed by MDE: ${result.report.length}. Converted: ${by('converted').length}. Converted, needs a human check: ${by('converted-check').length}. Not converted: ${by('not-converted').length}.`,
    `Banks: ${result.banks.length}. Questions: ${result.banks.reduce((n, b) => n + b.bank.questions.length, 0)}.`,
    '',
  ];
  const table = (title, rows, cols) => {
    if (!rows.length) return;
    lines.push(`## ${title}`, '', `| Item | MDE type | ${cols} |`, '| --- | --- | --- |');
    for (const r of rows) {
      const last = r.reason ?? [r.how, ...(r.notes ?? [])].filter(Boolean).join('; ');
      lines.push(`| ${r.naepId} (${r.itemTableId}) | ${r.mdeType} | ${last.replace(/\|/g, '/')} |`);
    }
    lines.push('');
  };
  table('Not converted', by('not-converted'), 'Why');
  table('Converted, check against MDE', by('converted-check'), 'How and what to check');
  if (problems.length) {
    lines.push('## Problems that stop the package', '', ...problems.map((p) => `- ${p}`), '');
  }
  return lines.join('\n');
}
