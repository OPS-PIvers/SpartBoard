// Reads one saved MDE item (details + scoring guide HTML) into neutral question specs.
import { decode, imagesOf, oneLine, text } from './html.mjs';

const LETTERS = 'ABCDEFGH';
const BLANK = '_____';
const MARK = '\u0001';
const STRESS = /<span class="stressed_text_1">([^<]*)<\/span>/g;

class Unsupported extends Error {}
const fail = (reason) => {
  throw new Unsupported(reason);
};

const strip = (html) =>
  html
    .replace(/<div class="attribute athk">[\s\S]*?<\/div>/, '')
    .replace(/<div class="quesId">[\s\S]*?<\/div>/, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/, '');

/** The part of a scoring guide after its "Rubric:" label (all of it when there is no label). */
const afterRubric = (guide0) => {
  const guide = guide0.replace(/<div class="quesId">[\s\S]*?<\/div>/, '');
  const m = /Rubric:\s*<\/span>(\s*<\/div>)?/.exec(guide);
  return m ? guide.slice(m.index + m[0].length) : guide;
};

const paragraphs = (html) =>
  [...html.matchAll(/<div class="paragraph"[^>]*>([\s\S]*?)<\/div>/g)].map(
    (m) => m[1]
  );

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9%°]+/g, ' ').trim();

/** Maps each answer onto the choice it names (exact, then a single near match), or null. */
const answerToChoice = (answer, choices) => {
  const exact = choices.filter((c) => norm(c) === norm(answer));
  if (exact.length === 1) return exact[0];
  const stem = (s) => norm(s).replace(/s\b/g, '');
  const near = choices.filter((c) => stem(c) === stem(answer));
  return near.length === 1 ? near[0] : null;
};

/** Choices read off a picture's alt text ("The answer options are a, b and c."). */
const choicesFromAlt = (alt) => {
  const m =
    /(?:answer options|possible words|two words|three words|words)\s*(?:are|of)?\s*:?\s*([^]*)$/i.exec(
      alt
    );
  if (!m) return [];
  const list = m[1].trim().replace(/\.$/, '');
  const parts = list.includes(',')
    ? list.split(/,\s*(?:and\s+)?/)
    : list.includes('. ')
      ? list.split(/\.\s+/)
      : list.split(/\s+and\s+/);
  return parts.map((p) => p.trim().replace(/\.$/, '')).filter(Boolean);
};

const isInteractionAlt = (alt) =>
  /\b(box|boxes)\b/i.test(alt) &&
  /(answer options|possible words|two words|three words|words are)/i.test(alt);

const mcOptions = (html) =>
  [
    ...html.matchAll(
      /<div>([A-H])\. <span class="itemtext">([\s\S]*?)<\/div>/g
    ),
  ].map((m) => ({ letter: m[1], text: oneLine(m[2]) }));

/** Per-option rationales keyed by letter, from a table or "A. ..." lines. */
const rationales = (guide) => {
  const out = {};
  for (const m of guide.matchAll(
    /RATIONALE\s+([A-H])<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g
  )) {
    out[m[1]] = oneLine(m[2]);
  }
  if (Object.keys(out).length) return out;
  for (const line of text(afterRubric(guide)).split('\n')) {
    const m = /^([A-H])\.\s+(.+)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
};

function parseMc(item, body) {
  const stem =
    /<div class="question">([\s\S]*?)<\/div>\s*<div class="distractors">/.exec(
      body
    )?.[1] ?? '';
  const dist = /<div class="distractors">([\s\S]*)$/.exec(body)?.[1] ?? '';
  const options = mcOptions(dist);
  const letter =
    /The correct answer is:\s*<div>([A-H])\./.exec(item.guide)?.[1] ??
    /The correct answer is:\s*<div>([A-H])\./.exec(item.details)?.[1];
  const correct = options.findIndex((o) => o.letter === letter);
  if (options.length < 2 || correct < 0) {
    fail(`MC options or key not readable (${options.length} options)`);
  }
  if (options.some((o) => !o.text)) fail('MC has a picture-only option');
  const why = rationales(item.guide);
  return [
    {
      kind: 'mc',
      text: text(stem),
      options: options.map((o) => o.text),
      correct,
      optionExplanations: options.map((o) => why[o.letter] ?? ''),
      explanation: why[letter] ?? '',
      images: imagesOf(stem),
    },
  ];
}

function parseMr(item, body) {
  const first = body.indexOf('<div class="mr-checkbox-div">');
  if (first < 0) fail('MR options not found');
  const stem = body.slice(0, first);
  const options = [
    ...body
      .slice(first)
      .matchAll(
        /<div class="mr-checkbox-div">[\s\S]*?<\/div>\s*<div class="paragraph">([\s\S]*?)<\/div>/g
      ),
  ].map((m) => oneLine(m[1]));
  const lines = text(afterRubric(item.guide)).split('\n');
  const right = new Set(
    lines
      .map((l) => /^([A-H])\.\s*Correct/.exec(l)?.[1])
      .filter((l) => l !== undefined)
  );
  if (options.length < 3 || right.size < 2 || right.size >= options.length) {
    fail(`MR key not readable (${options.length} options, ${right.size} right)`);
  }
  const why = rationales(item.guide);
  const flags = options.map((_, i) => right.has(LETTERS[i]));
  return [
    {
      kind: 'ma',
      text: text(stem),
      options,
      correct: flags,
      optionExplanations: options.map((_, i) => why[LETTERS[i]] ?? ''),
      explanation: options
        .map((_, i) => (flags[i] ? why[LETTERS[i]] : ''))
        .filter(Boolean)
        .join('\n'),
      images: imagesOf(stem),
    },
  ];
}

const rubricSentence = (guide) => {
  const paras = paragraphs(afterRubric(guide));
  const para = paras.find((p) => /class="stressed_text_1"/.test(p));
  return { paras, para: para ?? '' };
};

/** Puts each answer back into the next blank of a sentence. */
const fillBlanks = (sentence, answers) =>
  sentence
    .split(BLANK)
    .reduce((acc, part, i) => acc + part + (answers[i] ?? ''), '');

const blankedSentence = (para) => {
  const answers = [...para.matchAll(STRESS)].map((m) => decode(m[1]).trim());
  const sentence = text(para.replace(STRESS, MARK))
    .replace(/^The student [^:]*:\s*/i, '')
    .split(MARK)
    .join(BLANK);
  return { answers, sentence };
};

function parseInlineChoice(item, body) {
  const m = /<div class="abbi-inlineChoice">([\s\S]*?)<\/div>/.exec(body);
  if (!m) fail('IC item has no inline-choice sentence');
  const lead = text(body.slice(0, m.index));
  const choices = [];
  const sentenceHtml = m[1].replace(/<select>([\s\S]*?)<\/select>/g, (_, o) => {
    choices.push(
      [...o.matchAll(/<option>([\s\S]*?)<\/option>/g)]
        .map((x) => oneLine(x[1]))
        .filter((x) => x && !/^choose\.{3}$/i.test(x))
    );
    return ` ${MARK} `;
  });
  const sentence = text(sentenceHtml).split(MARK).join(BLANK);
  const keys = [...afterRubric(item.guide).matchAll(STRESS)].map((x) =>
    decode(x[1]).trim()
  );
  if (!choices.length || keys.length !== choices.length) {
    fail(`IC key does not line up (${choices.length} lists, ${keys.length} keys)`);
  }
  const answers = keys.map((k, i) => answerToChoice(k, choices[i]));
  if (answers.some((a) => a === null)) fail('IC key is not among its choices');
  const { para } = rubricSentence(item.guide);
  return [
    {
      kind: 'fib',
      blankType: 'dropdown',
      text: `${lead}\n${sentence}`.trim(),
      answers,
      choices,
      explanation: para ? fillBlanks(blankedSentence(para).sentence, answers) : '',
      images: imagesOf(body.slice(0, m.index)),
    },
  ];
}

function parseGapMatch(item, body) {
  const all = imagesOf(body);
  const drawing = all.filter((i) => isInteractionAlt(i.alt));
  if (!drawing.length) fail('GM has no picture listing its word choices');
  const bank = choicesFromAlt(drawing[drawing.length - 1].alt);
  const { paras, para } = rubricSentence(item.guide);
  if (!para) fail('GM rubric sentence not found');
  if (/Answer Option\s*\d/i.test(text(para))) {
    fail('GM accepts several complete answers');
  }
  const { answers, sentence } = blankedSentence(para);
  if (!answers.length || bank.length < answers.length) {
    fail(`GM words not readable (${bank.length} words, ${answers.length} blanks)`);
  }
  const mapped = answers.map((a) => answerToChoice(a, bank));
  if (mapped.some((a) => a === null)) fail('GM key is not among its word choices');
  const review = [];
  const note = paras.map((p) => text(p)).find((p) => /^Note:/i.test(p));
  if (note) review.push(`MDE note: ${note}`);
  const reuse = new Set(mapped).size < mapped.length;
  const lowerAll = mapped.every(
    (a, i) => answers[i] === lowerFirst(answers[i]) && a !== answers[i]
  );
  const words = bank.map((w) => (lowerAll ? lowerFirst(w) : w));
  mapped.forEach((a, i) => {
    if (!lowerAll && norm(a) !== norm(answers[i])) words[bank.indexOf(a)] = answers[i];
  });
  const keyed = mapped.map((a) => words[bank.indexOf(a)]);
  return [
    {
      kind: 'fib',
      blankType: 'drag',
      text: `${text(body.replace(/<img[^>]*>/g, ''))}\n${sentence}`.trim(),
      answers: keyed,
      bank: words,
      reuse,
      explanation: fillBlanks(sentence, keyed),
      images: all.filter((i) => !isInteractionAlt(i.alt)),
      review: [
        'Sentence and word list were read from picture text and MDE rubric; compare with MDE.',
        ...review,
      ],
    },
  ];
}

function parseDragMatch(item, body) {
  const lines = text(afterRubric(item.guide)).split('\n');
  const rows = [];
  for (const line of lines) {
    const m = /^(.+?):\s*(.+?)\.?$/.exec(line);
    if (m && !/^The student/i.test(line)) {
      rows.push({
        box: m[1].trim(),
        chips: m[2].split(/,\s*/).map((c) => c.trim().replace(/\.$/, '')),
      });
    }
  }
  if (rows.length < 2 || rows.some((r) => !r.chips.length)) {
    fail('Drag-to-box key not readable');
  }
  const oneEach = rows.every((r) => r.chips.length === 1);
  const pairs = rows.flatMap((r) =>
    r.chips.map((c) => (oneEach ? [r.box, c] : [c, r.box]))
  );
  const lead = text(body.replace(/<img[^>]*>/g, ''))
    .split('\n')
    .filter((l) => !/^Drag\b/i.test(l))
    .join('\n');
  return [
    {
      kind: 'matching',
      text: `${lead}\nMatch each item to its box.`.trim(),
      pairs,
      images: imagesOf(body),
      review: [
        'Pairs were read from the MDE rubric text; check the terms and whether the picture still shows the answer.',
      ],
    },
  ];
}

function parseConstructed(item, body) {
  const rows = [...item.guide.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]))
    .filter((cells) => cells.length === 2 && /^\d+$/.test(text(cells[0])));
  if (!rows.length) fail('CR rubric table not found');
  const levels = rows
    .map(([score, desc]) => {
      const cut = desc.indexOf('<span class="stressed_text_2">');
      const sample = cut >= 0 ? text(desc.slice(cut)) : '';
      return {
        score: Number(text(score)),
        text: text(cut >= 0 ? desc.slice(0, cut) : desc),
        sample: sample.replace(/^Sample Student Response:\s*/i, '').trim(),
      };
    })
    .sort((a, b) => a.score - b.score);
  const images = imagesOf(body).filter((i) => !/^Answer box/i.test(i.alt));
  const stem = text(body.replace(/<img[^>]*>/g, ''));
  return [{ kind: 'fr', text: stem, rubric: { levels }, images }];
}

const PARSERS = {
  MC: parseMc,
  MR: parseMr,
  IC: parseInlineChoice,
  GM: parseGapMatch,
  GGM: parseDragMatch,
  MATCH: parseDragMatch,
  CR: parseConstructed,
};

/** The numbers a listing row's HTML carries: year, MDE reference and number in the test. */
export const itemMeta = (item) => {
  const ref =
    /Question ID: <span class="questionId">([^<]+)<\/span>/.exec(
      item.details
    )?.[1] ?? '';
  return {
    ref,
    num: Number(/#(\d+)/.exec(ref)?.[1] ?? 0),
    year: /Year: (\d{4})/.exec(item.details)?.[1] ?? '',
  };
};

/** `{ ok: true, specs, bodyImages }` or `{ ok: false, reason, bodyImages }`. */
export function parseItem(item) {
  const body = strip(item.details);
  const bodyImages = imagesOf(body);
  const parser = PARSERS[item.type];
  if (!parser) {
    return {
      ok: false,
      reason:
        item.type === 'PG'
          ? 'Point graph: no matching question type; needs a hand conversion'
          : `No conversion for MDE type ${item.type}`,
      bodyImages,
    };
  }
  try {
    return { ok: true, specs: parser(item, body), bodyImages };
  } catch (err) {
    if (err instanceof Unsupported) {
      return { ok: false, reason: err.message, bodyImages };
    }
    throw err;
  }
}
