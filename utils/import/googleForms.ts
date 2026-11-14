// Google Forms import: the Forms API read (keys, points, pictures) and the form as a quiz or a poll.

import type { PollQuestion } from '@/types';
import { newImageOnlyLabel } from '@/utils/quizAnswerImages';
import { MAX_MULTI_PER_LIST, MAX_SINGLE_OPTIONS } from '@/utils/quizChoiceRows';
import {
  MAX_POLL_QUESTIONS,
  SCALE_SIZES,
  makeScaleOptions,
} from '@/utils/pollQuestions';
import type {
  ExtractedImage,
  ExtractedOption,
  ExtractedQuestion,
  ExtractedQuiz,
  RemoteImageFetcher,
} from '@/utils/quizDocumentImport/types';
import {
  IMPORT_MAX_FORM_ITEMS,
  IMPORT_MAX_FORM_OPTIONS,
  IMPORT_MAX_FORM_TEXT_CHARS,
  type ImportForm,
  type ImportFormItem,
  type ImportFormLeftOut,
  type ImportFormOption,
  type ImportFormQuestion,
} from './contract';

/** Read-only access to the teacher's forms, asked for the first time a form is imported. */
export const GOOGLE_FORMS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/forms.body.readonly';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v: unknown): string =>
  typeof v === 'string' ? v.trim().slice(0, IMPORT_MAX_FORM_TEXT_CHARS) : '';
const httpsUrl = (v: unknown): string | undefined =>
  typeof v === 'string' && v.startsWith('https://') && v.length <= 2048
    ? v
    : undefined;

type Question = ImportFormQuestion;

/** The first accepted answer for each value a key lists. */
const keyOf = (question: Obj): string[] => {
  const grading = isObj(question.grading) ? question.grading : {};
  const answers = isObj(grading.correctAnswers)
    ? list(grading.correctAnswers.answers)
    : [];
  return answers.map((a) => str(a.value)).filter(Boolean);
};

const pointsOf = (question: Obj): number | undefined => {
  const grading = isObj(question.grading) ? question.grading : {};
  const p = grading.pointValue;
  return typeof p === 'number' && Number.isFinite(p) && p >= 0 ? p : undefined;
};

const pictureOf = (v: unknown): string | undefined =>
  isObj(v) ? httpsUrl(v.contentUri) : undefined;

export interface ApiForm {
  title: string;
  form: ImportForm;
}

/** A `forms.get` reply as a form; null when it isn't one. */
export function formFromApi(raw: unknown, formId: string): ApiForm | null {
  if (!isObj(raw) || !Array.isArray(raw.items)) return null;
  const info = isObj(raw.info) ? raw.info : {};
  const title = str(info.title) || str(info.documentTitle) || 'Google Form';
  const leftOut: Partial<Record<ImportFormLeftOut, number>> = {};
  const count = (kind: ImportFormLeftOut) => {
    leftOut[kind] = (leftOut[kind] ?? 0) + 1;
  };
  const items: ImportFormItem[] = [];
  for (const item of list(raw.items)) {
    if (items.length >= IMPORT_MAX_FORM_ITEMS) break;
    const text = str(item.title);
    const description = str(item.description);
    const base = description ? { text, description } : { text };
    if (isObj(item.imageItem)) {
      const image = pictureOf(item.imageItem.image);
      if (image) items.push({ kind: 'image', text, image });
      else count('picture');
      continue;
    }
    if (isObj(item.videoItem)) {
      count('video');
      continue;
    }
    if (isObj(item.questionGroupItem)) {
      const group = item.questionGroupItem;
      const grid = isObj(group.grid) ? group.grid : {};
      const columns = isObj(grid.columns) ? grid.columns : {};
      const rows = list(group.questions);
      const image = pictureOf(group.image);
      const keyed = rows.map(keyOf);
      const points = rows.map(pointsOf).find((p) => p !== undefined);
      const question: Question = {
        kind: columns.type === 'CHECKBOX' ? 'checkboxGrid' : 'grid',
        ...base,
        rows: rows
          .map((r) => str(isObj(r.rowQuestion) ? r.rowQuestion.title : ''))
          .slice(0, IMPORT_MAX_FORM_OPTIONS),
        options: list(columns.options)
          .map((o) => ({ text: str(o.value) }))
          .filter((o) => o.text)
          .slice(0, IMPORT_MAX_FORM_OPTIONS),
        // One entry per row, a checkbox row's answers joined by `|`.
        ...(keyed.some((k) => k.length)
          ? { correct: keyed.map((k) => k.join('|')) }
          : {}),
        ...(points !== undefined ? { points } : {}),
        ...(image ? { image } : {}),
      };
      if (group.image && !image) count('picture');
      items.push(question);
      continue;
    }
    if (!isObj(item.questionItem)) continue;
    const q = isObj(item.questionItem.question)
      ? item.questionItem.question
      : {};
    const image = pictureOf(item.questionItem.image);
    if (item.questionItem.image && !image) count('picture');
    const shared = {
      ...base,
      ...(image ? { image } : {}),
      ...(pointsOf(q) !== undefined ? { points: pointsOf(q) } : {}),
    };
    const correct = keyOf(q);
    const withKey = correct.length ? { correct } : {};
    if (isObj(q.dateQuestion)) count('date');
    else if (isObj(q.timeQuestion)) count('time');
    else if (isObj(q.fileUploadQuestion)) count('fileUpload');
    else if (isObj(q.textQuestion))
      items.push({
        kind: q.textQuestion.paragraph === true ? 'paragraph' : 'short',
        ...shared,
        ...withKey,
      });
    else if (isObj(q.scaleQuestion)) {
      const s = q.scaleQuestion;
      items.push({
        kind: 'scale',
        ...shared,
        // The API leaves out a low of 0.
        low: typeof s.low === 'number' ? s.low : 0,
        high: typeof s.high === 'number' ? s.high : 5,
        ...(str(s.lowLabel) ? { lowLabel: str(s.lowLabel) } : {}),
        ...(str(s.highLabel) ? { highLabel: str(s.highLabel) } : {}),
      });
    } else if (isObj(q.ratingQuestion)) {
      const levels = q.ratingQuestion.ratingScaleLevel;
      items.push({
        kind: 'rating',
        ...shared,
        low: 1,
        high: typeof levels === 'number' ? levels : 5,
      });
    } else if (isObj(q.choiceQuestion)) {
      const c = q.choiceQuestion;
      const options = list(c.options)
        .filter((o) => o.isOther !== true)
        .map((o): ImportFormOption => {
          const picture = pictureOf(o.image);
          if (o.image && !picture) count('picture');
          return { text: str(o.value), ...(picture ? { image: picture } : {}) };
        })
        .filter((o) => o.text || o.image)
        .slice(0, IMPORT_MAX_FORM_OPTIONS);
      if (!options.length) continue;
      items.push({
        kind:
          c.type === 'CHECKBOX'
            ? 'checkbox'
            : c.type === 'DROP_DOWN'
              ? 'dropdown'
              : 'choice',
        ...shared,
        options,
        ...withKey,
      });
    }
  }
  return {
    title,
    form: {
      formId,
      items,
      ...(Object.keys(leftOut).length ? { leftOut } : {}),
    },
  };
}

/** Reads a form the teacher owns or can edit; null when Google refuses or answers with something else. */
export async function fetchGoogleForm(
  formId: string,
  token: string,
  fetchFn: typeof fetch = fetch
): Promise<ApiForm | null> {
  try {
    const res = await fetchFn(
      `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    return formFromApi(await res.json(), formId);
  } catch {
    return null;
  }
}

export const formQuestionCount = (form: ImportForm | undefined): number =>
  form?.items.filter((i) => i.kind !== 'image').length ?? 0;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const letter = (i: number) =>
  i < LETTERS.length ? LETTERS[i] : `${LETTERS[i % 26]}${Math.floor(i / 26)}`;

const scaleSteps = (q: Question): string[] => {
  const low = Math.max(-10, Math.min(q.low ?? 1, 10));
  const high = Math.max(low, Math.min(q.high ?? 5, low + 10));
  return Array.from({ length: high - low + 1 }, (_, i) => String(low + i));
};

const join = (text: string, more: string) =>
  text && more ? `${text}: ${more}` : text || more;

/** Copies each picture once, a few at a time; a picture that won't copy is left out and counted. */
async function copyPictures(
  urls: readonly string[],
  fetchImage: RemoteImageFetcher
): Promise<Map<string, ExtractedImage>> {
  const out = new Map<string, ExtractedImage>();
  const unique = [...new Set(urls)];
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++];
      const got = await fetchImage(url).catch(() => null);
      if (got)
        out.set(url, {
          id: crypto.randomUUID(),
          blob: got.blob,
          contentType: got.contentType,
          name: `Form picture ${out.size + 1}`,
        });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}

const plural = (n: number, one: string, many: string) =>
  n === 1 ? `1 ${one}` : `${n} ${many}`;

type QuizLeftOut = Partial<Record<ImportFormLeftOut, number>>;

const LEFT_OUT: Record<keyof QuizLeftOut, (n: number) => string> = {
  date: (n) => plural(n, 'date question', 'date questions'),
  time: (n) => plural(n, 'time question', 'time questions'),
  fileUpload: (n) => plural(n, 'file upload question', 'file upload questions'),
  video: (n) => plural(n, 'video', 'videos'),
  picture: (n) => plural(n, 'picture', 'pictures'),
};

/** "Skipped: a, b and c." in a fixed order; null when nothing was. */
export function formLeftOutSummary(counts: QuizLeftOut): string | null {
  const parts = (Object.keys(LEFT_OUT) as (keyof QuizLeftOut)[])
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => LEFT_OUT[k](counts[k] ?? 0));
  if (!parts.length) return null;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Skipped: ${list}.`;
}

/** Quizzes have no rating scale, so a form's scales and ratings stay out of a quiz. */
export const SCALES_LEFT_OUT = 'Rating scales are not supported in quizzes.';
/** SpartBoard knows who answered, so a form's name or email question starts unticked. */
export const WHO_UNTICK = 'Name field skipped.';
const ASKS_WHO =
  /^\s*(?:(?:your|student(?:'s)?)\s+)?(?:(?:full|first|last)\s+)?(?:name|e-?mail(?:\s+address)?)\s*[:?]?\s*$/i;

/** Right choices all stay; wrong ones past the quiz editor's caps are dropped, in form order. */
function fitChoices(
  options: ExtractedOption[],
  correct: readonly string[] | undefined,
  multi: boolean
): { options: ExtractedOption[]; right: string[]; dropped: string[] } {
  const texts = new Set(options.map((o) => o.text));
  const right = (correct ?? []).filter((c) => texts.has(c));
  const rightSet = new Set(multi ? right : right.slice(0, 1));
  // With no key every choice may be right, so a choose-all question keeps room for both lists.
  const wrongCap = multi
    ? rightSet.size
      ? MAX_MULTI_PER_LIST
      : MAX_MULTI_PER_LIST * 2
    : MAX_SINGLE_OPTIONS - rightSet.size;
  let wrong = 0;
  const fits = (o: ExtractedOption) =>
    rightSet.has(o.text) || ++wrong <= wrongCap;
  const kept: ExtractedOption[] = [];
  const dropped: string[] = [];
  for (const o of options)
    if (fits(o)) kept.push({ ...o, letter: letter(kept.length) });
    else dropped.push(o.text);
  return { options: kept, right: [...rightSet], dropped };
}

/** The row note when a question couldn't hold every choice, naming the ones that came over. */
const limitNote = (
  kept: readonly ExtractedOption[],
  dropped: number
): string[] =>
  dropped
    ? [
        `Answer choice limit exceeded. Options imported: ${kept.map((o) => o.text).join('; ')}.`,
      ]
    : [];

/** The form as the quiz reader's result, so it lands in the same review table, pictures and all. */
export async function formToExtractedQuiz(
  title: string,
  form: ImportForm,
  fetchImage: RemoteImageFetcher
): Promise<ExtractedQuiz> {
  const urls = form.items.flatMap((i) =>
    i.kind === 'image'
      ? [i.image]
      : [
          ...(i.image ? [i.image] : []),
          ...(i.options ?? []).flatMap((o) => (o.image ? [o.image] : [])),
        ]
  );
  const pictures = await copyPictures(urls, fetchImage);
  const counts: QuizLeftOut = { ...form.leftOut };
  let scales = 0;
  // The most choices a capped question kept, for the form-wide note.
  let choiceCap = 0;
  const capped = (kept: number, dropped: number) => {
    if (dropped > 0) choiceCap = Math.max(choiceCap, kept);
  };
  const add = (k: keyof QuizLeftOut, n: number) => {
    if (n > 0) counts[k] = (counts[k] ?? 0) + n;
  };
  add('picture', urls.filter((u) => !pictures.has(u)).length);
  const idOf = (url: string | undefined) =>
    url ? pictures.get(url)?.id : undefined;

  const questions: ExtractedQuestion[] = [];
  // A picture on its own shows with the question after it.
  let pending: string[] = [];
  const push = (
    q: Omit<ExtractedQuestion, 'number' | 'imageIds' | 'warnings'> & {
      warnings?: string[];
      imageIds?: string[];
    }
  ) => {
    questions.push({
      ...q,
      number: questions.length + 1,
      imageIds: [...pending, ...(q.imageIds ?? [])],
      warnings: q.warnings ?? [],
    });
    pending = [];
  };
  const optionsOf = (q: Question): ExtractedOption[] => {
    const taken = (q.options ?? []).map((o) => o.text).filter(Boolean);
    return (q.options ?? []).flatMap((o, i): ExtractedOption[] => {
      const imageId = idOf(o.image);
      // A picture-only choice whose picture didn't copy has nothing left to show.
      if (!o.text && !imageId) return [];
      const label = o.text || newImageOnlyLabel(taken);
      taken.push(label);
      return [
        {
          letter: letter(i),
          text: label,
          ...(imageId
            ? { imageId, ...(o.text ? { textWithPicture: true } : {}) }
            : {}),
        },
      ];
    });
  };

  for (const item of form.items) {
    if (item.kind === 'image') {
      const id = idOf(item.image);
      if (id) pending.push(id);
      continue;
    }
    const own = idOf(item.image);
    const imageIds = own ? [own] : [];
    const points = item.points !== undefined ? { points: item.points } : {};
    const text = item.text || (item.description ?? '');
    switch (item.kind) {
      case 'choice':
      case 'dropdown':
      case 'checkbox': {
        const multi = item.kind === 'checkbox';
        const { options, right, dropped } = fitChoices(
          optionsOf(item),
          item.correct,
          multi
        );
        capped(options.length, dropped.length);
        push({
          warnings: limitNote(options, dropped.length),
          text,
          type: multi ? 'MA' : 'MC',
          options,
          correctAnswer: multi ? right.join('|') : (right[0] ?? ''),
          imageIds,
          ...points,
        });
        break;
      }
      case 'short':
        if (!item.correct?.length && ASKS_WHO.test(text)) {
          push({
            text,
            type: 'free-response',
            options: [],
            correctAnswer: '',
            imageIds,
            suggestUntick: WHO_UNTICK,
          });
        } else if (item.correct?.length) {
          const [answer, ...others] = item.correct;
          push({
            text,
            type: 'FIB',
            options: [],
            correctAnswer: answer,
            imageIds,
            ...points,
            ...(others.length
              ? { blankAlternates: [{ answers: others }] }
              : {}),
          });
        } else
          push({
            text,
            type: 'free-response',
            options: [],
            correctAnswer: '',
            imageIds,
            ...points,
          });
        break;
      case 'paragraph':
        push({
          text,
          type: 'free-response',
          options: [],
          correctAnswer: '',
          imageIds,
          ...points,
        });
        break;
      case 'scale':
      case 'rating':
        // A rating's picture still shows, with the next question.
        pending.push(...imageIds);
        scales += 1;
        break;
      case 'grid':
      case 'checkboxGrid': {
        const multi = item.kind === 'checkboxGrid';
        (item.rows ?? []).forEach((row, r) => {
          const { options, right, dropped } = fitChoices(
            optionsOf(item),
            (item.correct?.[r] ?? '').split('|'),
            multi
          );
          capped(options.length, dropped.length);
          push({
            warnings: limitNote(options, dropped.length),
            text: join(text, row),
            type: multi ? 'MA' : 'MC',
            options,
            correctAnswer: multi ? right.join('|') : (right[0] ?? ''),
            imageIds: r === 0 ? imageIds : [],
            ...points,
          });
        });
        break;
      }
    }
  }
  // A picture after the last question shows with that question.
  const last = questions.at(-1);
  if (last && pending.length) last.imageIds.push(...pending);
  const leftOut = formLeftOutSummary(counts);
  return {
    title,
    questions,
    images: [...pictures.values()],
    warnings: [
      ...(scales ? [SCALES_LEFT_OUT] : []),
      ...(choiceCap
        ? [
            `Maximum answer options is ${choiceCap}. Additional options are skipped.`,
          ]
        : []),
      ...(leftOut ? [leftOut] : []),
    ],
  };
}

/** The form as Poll questions (at most a poll's 20): choices stay choices, scales stay scales, written answers become words or text. */
export function formToPollQuestions(form: ImportForm): {
  questions: PollQuestion[];
  /** Questions past the poll's limit. */
  over: number;
} {
  const out: PollQuestion[] = [];
  const option = (label: string, correct = false) => ({
    id: crypto.randomUUID(),
    label,
    votes: 0,
    ...(correct ? { correct: true } : {}),
  });
  const choices = (q: Question, right: readonly string[] = q.correct ?? []) =>
    (q.options ?? [])
      .filter((o) => o.text)
      .map((o) => option(o.text, right.includes(o.text)));
  for (const item of form.items) {
    if (item.kind === 'image') continue;
    const question = item.text || (item.description ?? '');
    switch (item.kind) {
      case 'choice':
      case 'dropdown':
      case 'checkbox': {
        const options = choices(item);
        if (options.length)
          out.push({
            id: crypto.randomUUID(),
            question,
            options,
            kind: 'choice',
          });
        break;
      }
      case 'scale':
      case 'rating': {
        // A poll scale runs 1 to 5 or 1 to 10; any other range votes as numbered choices.
        const size = item.high ?? 5;
        const fits =
          (item.low ?? 1) === 1 &&
          (SCALE_SIZES as readonly number[]).includes(size);
        out.push(
          fits
            ? {
                id: crypto.randomUUID(),
                question,
                kind: 'scale',
                options: makeScaleOptions(size),
                ...(item.lowLabel ? { scaleLow: item.lowLabel } : {}),
                ...(item.highLabel ? { scaleHigh: item.highLabel } : {}),
              }
            : {
                id: crypto.randomUUID(),
                question,
                kind: 'choice',
                options: scaleSteps(item).map((t) => option(t)),
              }
        );
        break;
      }
      case 'short':
        out.push({
          id: crypto.randomUUID(),
          question,
          options: [],
          kind: 'words',
        });
        break;
      case 'paragraph':
        out.push({
          id: crypto.randomUUID(),
          question,
          options: [],
          kind: 'text',
        });
        break;
      case 'grid':
      case 'checkboxGrid':
        (item.rows ?? []).forEach((row, r) => {
          const options = choices(item, (item.correct?.[r] ?? '').split('|'));
          if (options.length)
            out.push({
              id: crypto.randomUUID(),
              question: join(question, row),
              options,
              kind: 'choice',
            });
        });
        break;
    }
  }
  return {
    questions: out.slice(0, MAX_POLL_QUESTIONS),
    over: Math.max(0, out.length - MAX_POLL_QUESTIONS),
  };
}

/** True when the form has a picture a poll can't show. */
export const formHasPictures = (form: ImportForm): boolean =>
  form.items.some(
    (i) =>
      !!i.image || (i.kind !== 'image' && !!i.options?.some((o) => o.image))
  );
