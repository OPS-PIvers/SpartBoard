// Port of utils/videoActivityGrading.ts gradeVideoActivityAnswer; videoActivityGrade.cases.json pins both.

export interface VaKeyQuestion {
  id: string;
  type?: string;
  text?: string;
  timestamp?: number;
  correctAnswer?: string;
  incorrectAnswers?: string[];
  acceptableVariants?: string[];
  allowPartialCredit?: boolean;
  points?: number;
}

export interface VaPublicQuestion {
  id: string;
  timestamp: number;
  text: string;
  type: string;
  options?: string[];
}

const normalize = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const splitKey = (s: string): string[] =>
  s
    .split('|')
    .map(normalize)
    .filter((x) => x.length > 0);

export function gradeVaAnswer(q: VaKeyQuestion, answer: string): boolean {
  const type = q.type ?? 'MC';
  const correct = q.correctAnswer ?? '';
  if (type === 'MC') {
    const key = normalize(correct);
    return key.length > 0 && key === normalize(answer);
  }
  if (type === 'FIB') {
    const given = normalize(answer);
    return [correct, ...(q.acceptableVariants ?? [])]
      .map(normalize)
      .some((a) => a.length > 0 && a === given);
  }
  if (type === 'MA') {
    const key = new Set(splitKey(correct));
    const given = new Set(splitKey(answer));
    return (
      key.size > 0 &&
      given.size === key.size &&
      [...given].every((g) => key.has(g))
    );
  }
  return false;
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Mirror of utils/videoActivityPublicQuestions.ts toVideoActivityPublicQuestion.
export function toVaPublicQuestion(q: VaKeyQuestion): VaPublicQuestion {
  const type = q.type ?? 'MC';
  const base: VaPublicQuestion = {
    id: q.id,
    timestamp: typeof q.timestamp === 'number' ? q.timestamp : 0,
    text: q.text ?? '',
    type,
  };
  const incorrect = (q.incorrectAnswers ?? []).filter(
    (s) => typeof s === 'string' && s.length > 0
  );
  if (type === 'MC') {
    base.options = shuffled([
      ...(q.correctAnswer ? [q.correctAnswer] : []),
      ...incorrect,
    ]);
  } else if (type === 'MA') {
    const correct = (q.correctAnswer ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    base.options = shuffled(Array.from(new Set([...correct, ...incorrect])));
  }
  return base;
}

/** True when stored questions still carry their key. */
export const hasEmbeddedKey = (questions: unknown): boolean =>
  Array.isArray(questions) &&
  questions.some(
    (q) =>
      typeof q === 'object' &&
      q !== null &&
      typeof (q as VaKeyQuestion).correctAnswer === 'string'
  );

export function dedupeById<T extends { id: string }>(questions: T[]): T[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    if (seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  });
}
