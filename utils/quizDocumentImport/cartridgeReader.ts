/**
 * Reads a Common Cartridge (.imscc) — the export an LMS like Schoology gives
 * you — into the same `ExtractedQuiz` every other reader produces.
 *
 * A cartridge is not a document: it is a zip whose `imsmanifest.xml` points at
 * QTI 1.2 XML files, one `<item>` per question. That is a better source than a
 * printed test, because QTI records which choice is correct, so the answer key
 * comes with the questions rather than having to be found in the prose.
 */

import { joinBlanks } from '@/utils/quizFibBlanks';
import DOMPurify from 'dompurify';
import JSZip from 'jszip';
import type {
  ExtractedImage,
  ExtractedOption,
  ExtractedQuestion,
  ExtractedQuiz,
} from './types';
import { multiAnswerKey, type ReaderOptions } from './types';
import type { QuizQuestionType } from '@/types';
import { DocumentTooLargeError, MAX_CARTRIDGE_UNZIPPED_BYTES } from './limits';
import { readableText } from './cartridgeHtml';

const MANIFEST = 'imsmanifest.xml';
const FILE_BASE = /\$IMS-?CC-?FILEBASE\$\/?/gi;

/** Extensions Quiz can show as an image stimulus. */
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

const localName = (el: Element): string =>
  el.tagName.includes(':') ? el.tagName.split(':')[1] : el.tagName;

const descendants = (root: Element | Document, name: string): Element[] =>
  Array.from(root.getElementsByTagName('*')).filter(
    (el) => localName(el) === name
  );

const firstDescendant = (
  root: Element | Document,
  name: string
): Element | null => descendants(root, name)[0] ?? null;

const childrenNamed = (root: Element, name: string): Element[] =>
  Array.from(root.children).filter((el) => localName(el) === name);

/** `<mattext>` text; a stem keeps its line breaks, a choice or term is one line. */
function materialText(
  root: Element | null,
  layout: 'lines' | 'inline' = 'inline'
): {
  text: string;
  imageSrcs: string[];
} {
  if (!root) return { text: '', imageSrcs: [] };
  const parts: string[] = [];
  const imageSrcs: string[] = [];
  for (const mattext of descendants(root, 'mattext')) {
    const raw = mattext.textContent ?? '';
    if (!raw.trim()) continue;
    if ((mattext.getAttribute('texttype') ?? '').includes('html')) {
      const html = new DOMParser().parseFromString(
        DOMPurify.sanitize(raw),
        'text/html'
      );
      for (const img of Array.from(html.getElementsByTagName('img'))) {
        const src = img.getAttribute('src');
        if (src) imageSrcs.push(src);
      }
      parts.push(readableText(html.body));
    } else {
      parts.push(raw);
    }
  }
  const text =
    layout === 'lines'
      ? parts
          .map((part) => part.trim())
          .filter(Boolean)
          .join('\n')
      : parts.join(' ').replace(/\s+/g, ' ').trim();
  return { text, imageSrcs };
}

/** The `question_type` an LMS writes into the item's metadata. */
function metadataField(item: Element, label: string): string {
  for (const field of descendants(item, 'qtimetadatafield')) {
    const name = firstDescendant(field, 'fieldlabel')?.textContent?.trim();
    if (name === label) {
      return firstDescendant(field, 'fieldentry')?.textContent?.trim() ?? '';
    }
  }
  return '';
}

/**
 * The idents a scoring condition accepts. QTI marks the right answer by
 * pointing a `respcondition` that sets a score at a choice's ident, so this is
 * where the answer key lives.
 */
function correctIdents(item: Element, multi: boolean): Map<string, string[]> {
  const byResponse = new Map<string, string[]>();
  const processing = firstDescendant(item, 'resprocessing');
  if (!processing) return byResponse;

  for (const condition of descendants(processing, 'respcondition')) {
    const scores = descendants(condition, 'setvar').some((setvar) => {
      const name = (setvar.getAttribute('varname') ?? '').toLowerCase();
      const value = Number.parseFloat(setvar.textContent ?? '');
      return name.includes('score') && Number.isFinite(value) && value > 0;
    });
    if (!scores) continue;
    // A condition under `<not>` names a wrong answer, not a right one.
    if (!multi && descendants(condition, 'not').length > 0) continue;

    for (const equal of descendants(condition, 'varequal')) {
      // A choice-all item mixes right choices with wrong ones under `<not>`.
      if (underNot(equal, condition)) continue;
      const respident = equal.getAttribute('respident') ?? '';
      // An empty value is kept: some exports give a choice the ident "".
      const value = (equal.textContent ?? '').trim();
      byResponse.set(respident, [...(byResponse.get(respident) ?? []), value]);
    }
  }
  return byResponse;
}

function underNot(el: Element, stop: Element): boolean {
  for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
    if (localName(p) === 'not') return true;
  }
  return false;
}

interface Choice {
  ident: string;
  text: string;
}

/** One `<response_lid>`: the prompt it belongs to and the choices under it. */
function choicesOf(responseLid: Element): Choice[] {
  return descendants(responseLid, 'response_label').map((label) => ({
    ident: label.getAttribute('ident') ?? '',
    text: materialText(label).text,
  }));
}

/** Drops an empty key ident unless a choice really carries the ident "". */
const offered = (idents: readonly string[], choices: Choice[]): string[] =>
  idents.filter((id) => id !== '' || choices.some((c) => c.ident === ''));

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const asOptions = (choices: Choice[]): ExtractedOption[] =>
  choices.map((choice, index) => ({
    letter: LETTERS[index] ?? '',
    text: choice.text,
  }));

/** Common Cartridge states the type as a `cc_profile`; Canvas writes `question_type`. */
function typeFromProfile(
  profile: string,
  multi: boolean
): QuizQuestionType | null {
  const kind = profile.toLowerCase();
  if (!kind.startsWith('cc.')) return null;
  if (kind.includes('essay')) return 'free-response';
  if (kind.includes('fib') || kind.includes('pattern_match')) return 'FIB';
  if (multi && kind.includes('multiple_response')) return 'MA';
  if (
    kind.includes('multiple_choice') ||
    kind.includes('multiple_response') ||
    kind.includes('true_false')
  ) {
    return 'MC';
  }
  return null;
}

/** Question types an LMS writes; anything unknown is decided by its shape. */
function typeOf(
  declared: string,
  profile: string,
  responseLids: Element[],
  multi: boolean
): QuizQuestionType {
  const kind = declared.toLowerCase();
  if (kind.includes('essay')) return 'free-response';
  if (kind.includes('matching')) return 'Matching';
  if (kind.includes('ordering')) return 'Ordering';
  if (kind.includes('short_answer') || kind.includes('numerical')) return 'FIB';
  if (kind.includes('fill_in') || kind.includes('fib')) return 'FIB';
  if (
    multi &&
    (kind.includes('multiple_answers') || kind.includes('multiple_response'))
  ) {
    return 'MA';
  }
  const fromProfile = typeFromProfile(profile, multi);
  if (fromProfile) return fromProfile;
  if (responseLids.length > 1) return 'Matching';
  if (responseLids.length === 1) {
    const cardinality = responseLids[0].getAttribute('rcardinality') ?? '';
    return multi && cardinality.toLowerCase() === 'multiple' ? 'MA' : 'MC';
  }
  return 'free-response';
}

/** Matching comes back as the pipe-separated pairs `QuizQuestion` stores. */
function matchingPairs(
  item: Element,
  responseLids: Element[],
  correct: Map<string, string[]>
): { answer: string; warnings: string[] } {
  const pairs: string[] = [];
  const warnings: string[] = [];
  for (const lid of responseLids) {
    const ident = lid.getAttribute('ident') ?? '';
    // The term sits in the material beside its own choice list.
    // The term is the material directly under the prompt; `descendants` would
    // swallow the choice list with it.
    const term = childrenNamed(lid, 'material')
      .map((m) => materialText(m).text)
      .join(' ')
      .trim();
    const choices = choicesOf(lid);
    const wanted = offered(correct.get(ident) ?? [], choices)[0];
    const choice = choices.find((c) => c.ident === wanted);
    if (!term || !choice) continue;
    if (term.includes(':') || term.includes('|') || choice.text.includes('|')) {
      warnings.push(
        'A matching pair contains a colon or a pipe, which this quiz uses to separate pairs — check it in the editor.'
      );
      continue;
    }
    pairs.push(`${term}:${choice.text}`);
  }
  if (pairs.length === 0) {
    warnings.push(
      'This came in as a matching question, but its pairs could not be read — rebuild it in the editor.'
    );
  }
  return { answer: pairs.join('|'), warnings };
}

/** Canvas "fill in multiple blanks": one response per `[name]` in the stem, which becomes `___`. */
function fillInMultipleBlanks(
  responseLids: Element[],
  correct: Map<string, string[]>,
  stemText: string
): { text: string; answer: string; warnings: string[] } {
  let text = stemText;
  const answers: string[] = [];
  const warnings: string[] = [];
  for (const lid of responseLids) {
    const name = childrenNamed(lid, 'material')
      .map((m) => materialText(m).text)
      .join(' ')
      .trim();
    if (name && text.includes(`[${name}]`))
      text = text.split(`[${name}]`).join('___');
    const choices = choicesOf(lid);
    const ident = lid.getAttribute('ident') ?? '';
    const wanted = offered(correct.get(ident) ?? [], choices);
    const accepted = choices
      .filter((c) => wanted.includes(c.ident))
      .map((c) => c.text)
      .filter(Boolean);
    answers.push(accepted[0] ?? '');
    if (accepted.length > 1) {
      warnings.push(
        `Blank ${answers.length} accepted ${accepted.length} answers (${accepted.join(', ')}); the first was kept.`
      );
    }
  }
  return { text, answer: joinBlanks(answers), warnings };
}

function toQuestion(
  item: Element,
  number: number,
  multi: boolean
): ExtractedQuestion {
  const warnings: string[] = [];
  const presentation = firstDescendant(item, 'presentation');
  const responseLids = presentation
    ? descendants(presentation, 'response_lid')
    : [];
  const declared = metadataField(item, 'question_type');
  const profile = metadataField(item, 'cc_profile');
  const type = typeOf(declared, profile, responseLids, multi);

  // The stem is the material that is not inside a choice list.
  const stemHolders = presentation
    ? childrenNamed(presentation, 'material')
    : [];
  const stem = stemHolders
    .map((holder) => materialText(holder, 'lines'))
    .reduce<{ text: string; imageSrcs: string[] }>(
      (all, part) => ({
        text: [all.text, part.text].filter(Boolean).join('\n'),
        imageSrcs: [...all.imageSrcs, ...part.imageSrcs],
      }),
      { text: '', imageSrcs: [] }
    );

  const correct = correctIdents(item, multi);
  let options: ExtractedOption[] = [];
  let correctAnswer = '';

  if (type === 'Matching') {
    const matched = matchingPairs(item, responseLids, correct);
    correctAnswer = matched.answer;
    warnings.push(...matched.warnings);
  } else if (type === 'MC' && responseLids.length === 1) {
    const choices = choicesOf(responseLids[0]);
    // A choice with no words can't be offered to students.
    options = asOptions(choices.filter((c) => c.text));
    const ident = responseLids[0].getAttribute('ident') ?? '';
    const wanted = offered(
      correct.get(ident) ?? [...correct.values()][0] ?? [],
      choices
    );
    if (wanted.length > 1) {
      // Quiz scores one right answer, so guessing which would mark students
      // wrong on the others.
      warnings.push(
        'This question had more than one correct answer in the export, so none was kept — pick one in the editor.'
      );
    } else if (wanted.length === 1) {
      const hit = choices.find((c) => c.ident === wanted[0]);
      if (hit?.text) correctAnswer = hit.text;
      else if (hit)
        warnings.push(
          'The export’s correct answer is blank, so type it in the editor.'
        );
      else
        warnings.push(
          'The export marks an answer this question does not offer, so it was left blank.'
        );
    }
  } else if (type === 'MA' && responseLids.length === 1) {
    const choices = choicesOf(responseLids[0]);
    options = asOptions(choices);
    const ident = responseLids[0].getAttribute('ident') ?? '';
    const wanted = new Set(
      offered(correct.get(ident) ?? [...correct.values()][0] ?? [], choices)
    );
    correctAnswer = multiAnswerKey(
      choices.filter((c) => wanted.has(c.ident)).map((c) => c.text)
    );
    if (!correctAnswer) {
      warnings.push(
        'The export did not mark which choices are correct, so they were left blank.'
      );
    }
  } else if (type === 'Ordering') {
    warnings.push(
      'This came in as an ordering question; the export does not record the order, so put the items in order in the editor.'
    );
  } else if (type === 'FIB' && responseLids.length >= 2) {
    const blanks = fillInMultipleBlanks(responseLids, correct, stem.text);
    stem.text = blanks.text;
    correctAnswer = blanks.answer;
    warnings.push(...blanks.warnings);
  } else if (type === 'FIB') {
    const accepted = [...correct.values()].flat().filter(Boolean);
    correctAnswer = accepted[0] ?? '';
    if (accepted.length > 1) {
      warnings.push(
        `The export accepted ${accepted.length} answers here (${accepted.join(', ')}); the first was kept.`
      );
    }
  }

  if (!stem.text) warnings.push('No question text was found.');

  return {
    number,
    text: stem.text,
    type,
    options,
    correctAnswer,
    imageIds: stem.imageSrcs,
    warnings,
  };
}

/** Unpacked bytes still allowed for this import, shared across every entry. */
interface UnzipBudget {
  remaining: number;
}

/** JSZip's `internalStream`, which its type definitions leave out. */
interface ZipStream {
  on(event: 'data', cb: (chunk: Uint8Array<ArrayBuffer>) => void): ZipStream;
  on(event: 'error', cb: (err: Error) => void): ZipStream;
  on(event: 'end', cb: () => void): ZipStream;
  pause(): ZipStream;
  resume(): ZipStream;
}

/** Streams an entry out of the zip and stops once the budget runs out. */
function unzipCapped(
  entry: JSZip.JSZipObject,
  budget: UnzipBudget
): Promise<Uint8Array<ArrayBuffer>[]> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const stream = (
      entry as unknown as {
        internalStream: (type: 'uint8array') => ZipStream;
      }
    ).internalStream('uint8array');
    stream
      .on('data', (chunk: Uint8Array<ArrayBuffer>) => {
        budget.remaining -= chunk.length;
        if (budget.remaining < 0) {
          stream.pause();
          reject(
            new DocumentTooLargeError(
              `This export unpacks to more than ${Math.round(MAX_CARTRIDGE_UNZIPPED_BYTES / 1024 / 1024)} MB. Export the test on its own from your LMS and try again.`
            )
          );
          return;
        }
        chunks.push(chunk);
      })
      .on('error', reject)
      .on('end', () => resolve(chunks))
      .resume();
  });
}

async function unzipText(
  entry: JSZip.JSZipObject,
  budget: UnzipBudget
): Promise<string> {
  const decoder = new TextDecoder();
  const chunks = await unzipCapped(entry, budget);
  return (
    chunks.map((c) => decoder.decode(c, { stream: true })).join('') +
    decoder.decode()
  );
}

/** Turns HTML-only named entities (`&iacute;`) into numeric ones, which XML accepts. */
function defineHtmlEntities(xml: string): string {
  const decoder = new DOMParser();
  const decoded = new Map<string, string>();
  return xml.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (whole, name: string) => {
    if (['lt', 'gt', 'amp', 'quot', 'apos'].includes(name)) return whole;
    let numeric = decoded.get(name);
    if (numeric === undefined) {
      const text =
        decoder.parseFromString(whole, 'text/html').documentElement
          .textContent ?? '';
      numeric =
        text && text !== whole
          ? Array.from(text, (c) => `&#${c.codePointAt(0)};`).join('')
          : whole;
      decoded.set(name, numeric);
    }
    return numeric;
  });
}

/** Every QTI item in one XML file, in the order the file lists them. */
function itemsIn(xml: string): { title: string; items: Element[] } | null {
  const doc = new DOMParser().parseFromString(
    defineHtmlEntities(xml),
    'application/xml'
  );
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  if (!firstDescendant(doc, 'questestinterop')) return null;
  const holder =
    firstDescendant(doc, 'assessment') ?? firstDescendant(doc, 'objectbank');
  const items = descendants(doc, 'item');
  if (items.length === 0) return null;
  return { title: holder?.getAttribute('title')?.trim() ?? '', items };
}

/** A stray `%` in an export's path must not throw the whole import away. */
function decodePath(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** `$IMS-CC-FILEBASE$/media/a.png` and `../web_resources/a.png` alike. */
function zipPathFor(src: string, zip: JSZip): string | null {
  const cleaned = decodePath(src.replace(FILE_BASE, ''))
    .replace(/^\.{1,2}\//, '')
    .replace(/^\/+/, '')
    .split('?')[0];
  if (zip.file(cleaned)) return cleaned;
  const tail = cleaned.split('/').pop() ?? cleaned;
  const match = zip
    .file(/.*/)
    .find((entry) => entry.name.split('/').pop() === tail);
  return match ? match.name : null;
}

interface Picture {
  blob: Blob;
  contentType: string;
  name: string;
}

/** A picture, or where it failed: inside the zip or on another website. */
type PictureResult = { picture: Picture } | { failed: 'zip' | 'remote' };

/** Types a linked picture may arrive as; SVG is left out because it can carry script. */
const REMOTE_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const DATA_URI = /^data:(image\/(?:png|jpeg|gif|webp));base64,([\s\S]*)$/i;

/** How many linked pictures are copied at once. */
const REMOTE_CONCURRENCY = 4;

function fromDataUri(src: string): Picture | null {
  const match = DATA_URI.exec(src.trim());
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const contentType = match[1].toLowerCase();
    return {
      blob: new Blob([bytes], { type: contentType }),
      contentType,
      name: `picture.${REMOTE_IMAGE_TYPES[contentType] ?? 'png'}`,
    };
  } catch {
    return null;
  }
}

/** The file name a linked picture is labelled with. */
function remoteName(src: string, contentType: string): string {
  const ext = REMOTE_IMAGE_TYPES[contentType] ?? 'png';
  try {
    const tail = decodePath(new URL(src).pathname.split('/').pop() ?? '');
    const base = tail.replace(/\.[a-z0-9]+$/i, '').slice(0, 60);
    return /^[\w.-]+$/.test(base) ? `${base}.${ext}` : `picture.${ext}`;
  } catch {
    return `picture.${ext}`;
  }
}

/** Finds each picture once, however many questions or banks point at it. */
function pictureFinder(
  zip: JSZip,
  budget: UnzipBudget,
  fetchRemote: ReaderOptions['fetchRemoteImage']
): (src: string) => Promise<PictureResult> {
  const cache = new Map<string, Promise<PictureResult>>();

  const find = async (src: string): Promise<PictureResult> => {
    if (/^data:/i.test(src)) {
      const picture = fromDataUri(src);
      return picture ? { picture } : { failed: 'zip' };
    }
    if (/^https?:\/\//i.test(src)) {
      if (!fetchRemote) return { failed: 'remote' };
      try {
        const fetched = await fetchRemote(src);
        const contentType = fetched?.contentType.toLowerCase() ?? '';
        if (!fetched || !REMOTE_IMAGE_TYPES[contentType]) {
          return { failed: 'remote' };
        }
        return {
          picture: {
            blob: fetched.blob,
            contentType,
            name: remoteName(src, contentType),
          },
        };
      } catch (err) {
        console.warn(
          '[quizDocumentImport] could not copy a linked picture',
          err
        );
        return { failed: 'remote' };
      }
    }
    const path = zipPathFor(src, zip);
    const contentType = path
      ? IMAGE_TYPES[path.split('.').pop()?.toLowerCase() ?? '']
      : undefined;
    const entry = path ? zip.file(path) : null;
    if (!path || !entry || !contentType) return { failed: 'zip' };
    try {
      const blob = new Blob(await unzipCapped(entry, budget), {
        type: contentType,
      });
      return {
        picture: {
          blob,
          contentType,
          name: path.split('/').pop() ?? 'picture',
        },
      };
    } catch (err) {
      if (err instanceof DocumentTooLargeError) throw err;
      // A picture that will not unzip is one row's note, not a failed import.
      console.warn('[quizDocumentImport] could not unzip a picture', err);
      return { failed: 'zip' };
    }
  };

  return (src) => {
    const known = cache.get(src);
    if (known) return known;
    const pending = find(src);
    cache.set(src, pending);
    return pending;
  };
}

/** Starts the linked pictures a few at a time, so a big export doesn't wait on each in turn. */
async function prefetchRemote(
  srcs: readonly string[],
  find: (src: string) => Promise<PictureResult>
): Promise<void> {
  const queue = [...new Set(srcs.filter((s) => /^https?:\/\//i.test(s)))];
  const worker = async (): Promise<void> => {
    for (let src = queue.shift(); src; src = queue.shift()) await find(src);
  };
  await Promise.all(
    Array.from({ length: Math.min(REMOTE_CONCURRENCY, queue.length) }, worker)
  );
}

const pictureNote = (count: number, where: 'zip' | 'remote'): string => {
  const what = count === 1 ? 'A picture' : `${count} pictures`;
  const them = count === 1 ? 'it' : 'them';
  return where === 'zip'
    ? `${what} could not be taken out of the export — add ${them} in the editor.`
    : `${what} linked from another website couldn’t be copied — add ${them} in the editor.`;
};

/** Swaps each question's picture `src`s for image ids, noting any picture that didn't come in. */
async function attachCartridgeImages(
  questions: ExtractedQuestion[],
  find: (src: string) => Promise<PictureResult>
): Promise<{ questions: ExtractedQuestion[]; images: ExtractedImage[] }> {
  const images: ExtractedImage[] = [];
  const idBySrc = new Map<string, string>();

  const attached: ExtractedQuestion[] = [];
  for (const question of questions) {
    const imageIds: string[] = [];
    const missing = { zip: 0, remote: 0 };
    for (const src of question.imageIds) {
      const known = idBySrc.get(src);
      if (known) {
        imageIds.push(known);
        continue;
      }
      const result = await find(src);
      if ('failed' in result) {
        missing[result.failed] += 1;
        continue;
      }
      const id = `img-${images.length + 1}`;
      idBySrc.set(src, id);
      images.push({ id, ...result.picture });
      imageIds.push(id);
    }
    attached.push({
      ...question,
      imageIds,
      warnings: [
        ...question.warnings,
        ...(missing.zip > 0 ? [pictureNote(missing.zip, 'zip')] : []),
        ...(missing.remote > 0 ? [pictureNote(missing.remote, 'remote')] : []),
      ],
    });
  }
  return { questions: attached, images };
}

const NOT_A_CARTRIDGE =
  'That doesn’t look like an LMS export. Upload the .imscc file the LMS gave you, not a zip you made yourself.';

/** Reads the one test in a cartridge; several means the first is taken. */
export async function readCartridge(
  file: Blob,
  fallbackTitle: string,
  maxUnzippedBytes: number = MAX_CARTRIDGE_UNZIPPED_BYTES,
  options: ReaderOptions = {}
): Promise<ExtractedQuiz> {
  const multi = options.multiAnswer === true;
  const budget: UnzipBudget = { remaining: maxUnzippedBytes };
  const zip = await new JSZip().loadAsync(file);
  if (!zip.file(MANIFEST)) throw new Error(NOT_A_CARTRIDGE);

  const found: Array<{ title: string; items: Element[] }> = [];
  for (const entry of zip.file(/\.xml$/i)) {
    if (entry.name.endsWith(MANIFEST)) continue;
    const parsed = itemsIn(await unzipText(entry, budget));
    if (parsed) found.push(parsed);
  }

  if (found.length === 0) {
    throw new Error(
      'No questions were found in that export. Export the test on its own from your LMS and try again.'
    );
  }

  const warnings: string[] = [];
  const [first, ...rest] = found;
  if (rest.length > 0) {
    warnings.push(
      `This export holds ${found.length} tests; “${first.title || fallbackTitle}” was brought in. Export the others one at a time.`
    );
  }

  const read = first.items.map((item, index) =>
    toQuestion(item, index + 1, multi)
  );
  const find = pictureFinder(zip, budget, options.fetchRemoteImage);
  await prefetchRemote(
    read.flatMap((q) => q.imageIds),
    find
  );
  const { questions, images } = await attachCartridgeImages(read, find);

  return {
    title: first.title || fallbackTitle,
    questions,
    images,
    warnings,
  };
}

/* ─── Every question bank in a collection export ─────────────────────── */

/** One question bank, or one quiz or test, in an LMS collection export. */
export interface CartridgeBank {
  /** The manifest's resource identifier, unique within the export. */
  id: string;
  title: string;
  /** Folder names from the collection's top down to the bank, not including it. */
  folderPath: string[];
  questions: ExtractedQuestion[];
  images: ExtractedImage[];
}

export interface CartridgeBankCollection {
  /** The collection's name, without the LMS's "Home : " breadcrumb. */
  title: string;
  /** In the order the export lists them, empty banks included. */
  banks: CartridgeBank[];
  /** Quizzes and tests in the export, which a bank import leaves out. */
  skippedTests: number;
  /** Question banks in the export, which a quiz import leaves out. */
  skippedBanks: number;
}

const isBankResource = (type: string): boolean => /question-?bank/i.test(type);

const isTestResource = (type: string): boolean =>
  /imsqti/i.test(type) && /assessment/i.test(type);

/** "Home : World History Tests" → "World History Tests". */
export function collectionTitle(raw: string, fallback: string): string {
  const last =
    raw
      .split(/\s+:\s+/)
      .pop()
      ?.trim() ?? '';
  return last || fallback;
}

interface ManifestBankRef {
  resourceId: string;
  title: string;
  folderPath: string[];
}

/** The items the manifest's outline lists, each with the folders above it. */
function outlinedBanks(
  manifest: Document,
  bankIds: ReadonlySet<string>
): ManifestBankRef[] {
  const refs: ManifestBankRef[] = [];
  const visit = (item: Element, path: string[]): void => {
    const title = childrenNamed(item, 'title')[0]?.textContent?.trim() ?? '';
    const ref = item.getAttribute('identifierref');
    if (ref) {
      if (bankIds.has(ref))
        refs.push({ resourceId: ref, title, folderPath: path });
      return;
    }
    const next = title ? [...path, title] : path;
    for (const child of childrenNamed(item, 'item')) visit(child, next);
  };
  const organization = firstDescendant(manifest, 'organization');
  if (organization) {
    for (const item of childrenNamed(organization, 'item')) visit(item, []);
  }
  return refs;
}

/** The file a manifest resource points at. */
function resourceHref(resource: Element): string {
  return (
    resource.getAttribute('href') ??
    childrenNamed(resource, 'file')[0]?.getAttribute('href') ??
    ''
  );
}

/** Reads every question bank (or every quiz, with `read: 'tests'`) in a collection export, keeping the folder each sat in. */
export async function readCartridgeBanks(
  file: Blob,
  fallbackTitle: string,
  options: ReaderOptions & {
    maxUnzippedBytes?: number;
    read?: 'banks' | 'tests';
  } = {}
): Promise<CartridgeBankCollection> {
  const multi = options.multiAnswer === true;
  const readTests = options.read === 'tests';
  const budget: UnzipBudget = {
    remaining: options.maxUnzippedBytes ?? MAX_CARTRIDGE_UNZIPPED_BYTES,
  };
  let zip: JSZip;
  try {
    zip = await new JSZip().loadAsync(file);
  } catch {
    throw new Error(NOT_A_CARTRIDGE);
  }
  const manifestEntry = zip.file(MANIFEST);
  if (!manifestEntry) throw new Error(NOT_A_CARTRIDGE);
  const manifest = new DOMParser().parseFromString(
    defineHtmlEntities(await unzipText(manifestEntry, budget)),
    'application/xml'
  );
  if (manifest.getElementsByTagName('parsererror').length > 0) {
    throw new Error(NOT_A_CARTRIDGE);
  }

  const resources = descendants(manifest, 'resource');
  const bankResources = new Map<string, Element>();
  let skippedTests = 0;
  let skippedBanks = 0;
  for (const resource of resources) {
    const type = resource.getAttribute('type') ?? '';
    const id = resource.getAttribute('identifier') ?? '';
    const isBank = isBankResource(type);
    const isTest = !isBank && isTestResource(type);
    if ((readTests ? isTest : isBank) && id) bankResources.set(id, resource);
    else if (isTest) skippedTests += 1;
    else if (isBank) skippedBanks += 1;
  }

  // Items the outline leaves out still come in, at the top.
  const outlined = outlinedBanks(manifest, new Set(bankResources.keys()));
  const listed = new Set(outlined.map((r) => r.resourceId));
  const refs = [
    ...outlined,
    ...[...bankResources.keys()]
      .filter((id) => !listed.has(id))
      .map((id) => ({ resourceId: id, title: '', folderPath: [] })),
  ];

  const read: Array<{
    ref: ManifestBankRef;
    fileTitle: string;
    questions: ExtractedQuestion[];
  }> = [];
  for (const ref of refs) {
    const resource = bankResources.get(ref.resourceId);
    const href = resource ? decodePath(resourceHref(resource)) : '';
    const entry = href ? zip.file(href) : null;
    const parsed = entry ? itemsIn(await unzipText(entry, budget)) : null;
    read.push({
      ref,
      fileTitle: parsed?.title ?? '',
      questions: (parsed?.items ?? []).map((item, index) =>
        toQuestion(item, index + 1, multi)
      ),
    });
  }

  const find = pictureFinder(zip, budget, options.fetchRemoteImage);
  await prefetchRemote(
    read.flatMap(({ questions }) => questions.flatMap((q) => q.imageIds)),
    find
  );

  const banks: CartridgeBank[] = [];
  for (const [index, { ref, fileTitle, questions: raw }] of read.entries()) {
    const { questions, images } = await attachCartridgeImages(raw, find);
    banks.push({
      id: ref.resourceId,
      title:
        ref.title ||
        fileTitle ||
        `${readTests ? 'Quiz' : 'Question bank'} ${index + 1}`,
      folderPath: ref.folderPath,
      questions,
      images,
    });
  }

  const general = firstDescendant(manifest, 'general');
  const titleHolder = general ? childrenNamed(general, 'title')[0] : null;
  const manifestTitle = titleHolder
    ? (firstDescendant(titleHolder, 'string')?.textContent ?? '')
    : '';
  return {
    title: collectionTitle(manifestTitle, fallbackTitle),
    banks,
    skippedTests,
    skippedBanks,
  };
}
