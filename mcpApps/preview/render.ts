// Draws the quiz and rubric preview cards; every value goes in as text, never as HTML.
import type {
  PreviewView,
  QuestionView,
  QuizView,
  RubricCardView,
  RubricCriterionView,
  RubricView,
} from './types';

export interface PreviewActions {
  /** Puts a message in the chat; resolves true when the host took it. */
  ask: (text: string) => Promise<boolean>;
  /** Tells Claude what the teacher is looking at. */
  focus: (text: string) => void;
  expand: () => void;
  open: (url: string) => void;
}

export interface RenderOptions {
  compact: boolean;
  superseded: boolean;
}

/** Questions shown before "Show all" while the card is inline. */
export const COMPACT_QUESTIONS = 3;
const MAX_ASK = 2000;
const PREFIX = 'From the preview card:';

const TYPE_LABELS: Record<QuestionView['type'], string> = {
  multiple_choice: 'Multiple choice',
  choose_all: 'Choose all',
  fill_in_blank: 'Fill in the blank',
  matching: 'Matching',
  ordering: 'Ordering',
  free_response: 'Free response',
};

type Child = Node | string | null | undefined | false;

function h(
  tag: string,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** Collapses what the host refuses in a message: long runs of blank lines and spaces. */
export function cleanMessage(text: string): string {
  return text
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]{65,}/g, ' ')
    .trim();
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const quizName = (v: QuizView) =>
  `the ${v.kind === 'quiz' ? 'quiz' : 'question bank'} "${v.title}" (${v.kind === 'quiz' ? 'quiz_id' : 'bank_id'} ${v.id})`;

export function questionMessage(
  v: QuizView,
  q: QuestionView,
  ask: string
): string {
  return cleanMessage(
    `${PREFIX} in ${quizName(v)}, change question ${q.n}: ${clip(ask.trim(), MAX_ASK)}`
  );
}

export function rubricDraftMessage(v: QuizView, q: QuestionView): string {
  return cleanMessage(
    `${PREFIX} draft a scoring rubric for question ${q.n} of ${quizName(v)} and attach it to that question. Ask me anything you need first. The question reads: "${clip(q.text, 400)}"`
  );
}

export function wholeQuizMessage(v: QuizView, ask: string): string {
  return cleanMessage(
    `${PREFIX} change ${quizName(v)}: ${clip(ask.trim(), MAX_ASK)}`
  );
}

export function criterionMessage(
  v: RubricView,
  c: RubricCriterionView,
  ask: string
): string {
  return cleanMessage(
    `${PREFIX} in the rubric "${v.title}" (rubric_id ${v.rubric_id}), change the "${c.name}" criterion: ${clip(ask.trim(), MAX_ASK)}`
  );
}

export function wholeRubricMessage(v: RubricView, ask: string): string {
  return cleanMessage(
    `${PREFIX} change the rubric "${v.title}" (rubric_id ${v.rubric_id}): ${clip(ask.trim(), MAX_ASK)}`
  );
}

/** Question text with ⟦equations⟧ set apart, since the card does not load the math renderer. */
function richText(text: string): HTMLElement {
  const out = h('span');
  const parts = text.split(/⟦([^⟧]*)⟧/);
  parts.forEach((part, i) => {
    if (!part) return;
    out.append(i % 2 === 1 ? h('code', { class: 'math' }, part) : part);
  });
  return out;
}

/** A "Change this…" link that opens a one-line box and sends what the teacher types. */
function askBox(
  label: string,
  placeholder: string,
  build: (ask: string) => string,
  actions: PreviewActions,
  disabled: boolean
): HTMLElement {
  const wrap = h('div', { class: 'ask' });
  const toggle = h('button', { type: 'button', class: 'link' }, label);
  if (disabled) toggle.setAttribute('disabled', '');
  // Not a <form>: hosts sandbox the card without allow-forms, which blocks submit events.
  const form = h('div', { class: 'ask-form', hidden: '' });
  const input = h('input', {
    type: 'text',
    placeholder,
    'aria-label': placeholder,
    maxlength: String(MAX_ASK),
  }) as HTMLInputElement;
  const send = h('button', { type: 'button', class: 'primary' }, 'Send');
  const status = h('span', { class: 'status', role: 'status' });
  form.append(input, send);
  wrap.append(toggle, form, status);
  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) input.focus();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      send.click();
    }
  });
  send.addEventListener('click', () => {
    const ask = input.value.trim();
    if (!ask) return;
    send.setAttribute('disabled', '');
    status.textContent = 'Sending…';
    void actions.ask(build(ask)).then((ok) => {
      send.removeAttribute('disabled');
      status.textContent = ok ? 'Sent to Claude.' : 'Not sent.';
      if (ok) {
        input.value = '';
        form.hidden = true;
      }
    });
  });
  return wrap;
}

function answerBlock(q: QuestionView): HTMLElement | null {
  switch (q.type) {
    case 'multiple_choice':
    case 'choose_all': {
      const right =
        q.type === 'multiple_choice'
          ? [q.correct_answer ?? '']
          : (q.correct_answers ?? []);
      const items = [
        ...right.filter(Boolean).map((t) => ({ t, ok: true })),
        ...(q.incorrect_answers ?? []).map((t) => ({ t, ok: false })),
      ];
      return h(
        'ul',
        { class: 'choices' },
        ...items.map(({ t, ok }) =>
          h(
            'li',
            { class: ok ? 'correct' : '' },
            h('span', { class: 'mark', 'aria-hidden': 'true' }, ok ? '✓' : ''),
            richText(t),
            ok ? h('span', { class: 'sr-only' }, ' (correct)') : null
          )
        )
      );
    }
    case 'fill_in_blank': {
      const blanks = q.blanks?.length
        ? q.blanks
        : [
            {
              answer: q.correct_answer ?? '',
              accepted_alternates: q.accepted_alternates,
            },
          ];
      return h(
        'ol',
        { class: 'key' },
        ...blanks.map((b) =>
          h(
            'li',
            {},
            h('strong', {}, b.answer),
            b.accepted_alternates?.length
              ? ` (also: ${b.accepted_alternates.join(', ')})`
              : ''
          )
        )
      );
    }
    case 'matching':
      return h(
        'div',
        {},
        h(
          'table',
          { class: 'pairs' },
          ...(q.pairs ?? []).map((p) =>
            h(
              'tr',
              {},
              h('td', {}, p.term),
              h('td', {}, '→'),
              h('td', {}, p.match)
            )
          )
        ),
        q.extra_matches?.length
          ? h(
              'p',
              { class: 'muted' },
              `Extra matches: ${q.extra_matches.join(', ')}`
            )
          : null
      );
    case 'ordering':
      return h(
        'ol',
        { class: 'key' },
        ...(q.items_in_order ?? []).map((t) => h('li', {}, t))
      );
    case 'free_response': {
      const limits = [
        q.min_words ? `at least ${q.min_words} words` : '',
        q.max_words ? `at most ${q.max_words} words` : '',
      ].filter(Boolean);
      if (!q.placeholder && limits.length === 0) return null;
      return h(
        'p',
        { class: 'muted' },
        q.placeholder ? `Hint: ${q.placeholder}` : '',
        q.placeholder && limits.length ? ' · ' : '',
        limits.length ? `Answer ${limits.join(', ')}.` : ''
      );
    }
    default:
      return null;
  }
}

/** Criteria as rows, levels as columns from highest to lowest points. */
export function rubricGrid(rubric: RubricCardView): HTMLElement {
  const table = h('table', { class: 'rubric' });
  for (const c of rubric.criteria) {
    const levels = [...c.levels].sort((a, b) => b.points - a.points);
    const top = levels[0]?.points ?? 0;
    table.append(
      h(
        'tr',
        {},
        h(
          'th',
          { scope: 'row' },
          h('div', {}, c.name),
          h('div', { class: 'muted' }, plural(top, 'pt')),
          c.description ? h('div', { class: 'desc' }, c.description) : null
        ),
        ...levels.map((l) =>
          h(
            'td',
            {},
            h('div', { class: 'level' }, `${l.label} · ${l.points}`),
            l.description ? h('div', { class: 'desc' }, l.description) : null
          )
        )
      )
    );
  }
  return table;
}

function questionCard(
  v: QuizView,
  q: QuestionView,
  actions: PreviewActions,
  disabled: boolean
): HTMLElement {
  const card = h('li', {
    class: `question${q.changed ? ' changed' : ''}`,
    tabindex: '-1',
  });
  const head = h(
    'div',
    { class: 'q-head' },
    h('span', { class: 'num' }, `Q${q.n}`),
    h('span', { class: 'muted' }, TYPE_LABELS[q.type] ?? q.type),
    h('span', { class: 'muted' }, plural(q.points, 'pt')),
    q.changed ? h('span', { class: 'badge new' }, 'Updated') : null,
    q.needs_answer_key
      ? h('span', { class: 'badge warn' }, 'Needs a key')
      : null
  );
  card.append(head, h('p', { class: 'q-text' }, richText(q.text)));
  const answers = answerBlock(q);
  if (answers) card.append(answers);
  const tags = [...(q.standards ?? []), ...(q.learning_targets ?? [])];
  if (tags.length) {
    card.append(
      h(
        'div',
        { class: 'tags' },
        ...tags.map((t) => h('span', { class: 'tag' }, t))
      )
    );
  }
  if (q.type === 'free_response') {
    if (q.rubric) {
      const details = h(
        'details',
        { class: 'rubric-box' },
        h(
          'summary',
          {},
          `Rubric: ${q.rubric.title} · ${plural(q.rubric.max_points, 'pt')}`,
          q.rubric.shown_to_students ? '' : ' · hidden from students'
        ),
        rubricGrid(q.rubric)
      );
      card.append(details);
    } else {
      const draft = h(
        'button',
        { type: 'button', class: 'secondary' },
        'Draft a rubric with Claude'
      );
      if (disabled) draft.setAttribute('disabled', '');
      const status = h('span', { class: 'status', role: 'status' });
      draft.addEventListener('click', () => {
        draft.setAttribute('disabled', '');
        void actions.ask(rubricDraftMessage(v, q)).then((ok) => {
          draft.removeAttribute('disabled');
          status.textContent = ok ? 'Sent to Claude.' : 'Not sent.';
        });
      });
      card.append(h('div', { class: 'rubric-none' }, draft, status));
    }
  }
  card.append(
    askBox(
      'Change this…',
      `What should change in question ${q.n}?`,
      (ask) => questionMessage(v, q, ask),
      actions,
      disabled
    )
  );
  card.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button, input, form, summary'))
      return;
    actions.focus(
      `The teacher is looking at question ${q.n} of ${quizName(v)}.`
    );
  });
  return card;
}

function header(
  kindLabel: string,
  title: string,
  facts: string[],
  open: { url: string; actions: PreviewActions } | null
): HTMLElement {
  const top = h(
    'header',
    {},
    h('div', { class: 'kind' }, kindLabel),
    h('h1', {}, title || 'Untitled'),
    h('p', { class: 'muted' }, facts.filter(Boolean).join(' · '))
  );
  if (open) {
    const btn = h(
      'button',
      { type: 'button', class: 'secondary open' },
      'Open SpartBoard'
    );
    btn.addEventListener('click', () => open.actions.open(open.url));
    top.append(btn);
  }
  return top;
}

function renderQuiz(
  v: QuizView,
  actions: PreviewActions,
  opts: RenderOptions
): HTMLElement[] {
  const changed = v.questions.filter((q) => q.changed).length;
  const facts = [
    plural(v.questions.length, 'question'),
    plural(v.total_points, 'point'),
    v.missing_answer_keys ? `${v.missing_answer_keys} need an answer key` : '',
    v.sections ? plural(v.sections, 'section') : '',
    v.passages ? plural(v.passages, 'passage') : '',
    v.bank_pulls ? plural(v.bank_pulls, 'bank pull') : '',
  ];
  const out: HTMLElement[] = [
    header(v.kind === 'quiz' ? 'Quiz' : 'Question bank', v.title, facts, {
      url: v.open_url,
      actions,
    }),
  ];
  if (changed || v.removed_questions) {
    out.push(
      h(
        'p',
        { class: 'notice' },
        [
          changed ? `${plural(changed, 'question')} updated` : '',
          v.removed_questions
            ? `${plural(v.removed_questions, 'question')} removed`
            : '',
        ]
          .filter(Boolean)
          .join(', ') + '.'
      )
    );
  }
  if (v.shared_with_plc) {
    out.push(
      h(
        'p',
        { class: 'notice' },
        'Shared with a PLC, so changes happen in SpartBoard.'
      )
    );
  }
  const disabled = opts.superseded || v.shared_with_plc;
  const shown = opts.compact
    ? v.questions.slice(0, COMPACT_QUESTIONS)
    : v.questions;
  out.push(
    h(
      'ol',
      { class: 'questions' },
      ...shown.map((q) => questionCard(v, q, actions, disabled))
    )
  );
  if (shown.length < v.questions.length) {
    const more = h(
      'button',
      { type: 'button', class: 'secondary wide' },
      `Show all ${v.questions.length} questions`
    );
    more.addEventListener('click', () => actions.expand());
    out.push(more);
  }
  out.push(
    h(
      'footer',
      {},
      askBox(
        `Ask Claude to change the whole ${v.kind === 'quiz' ? 'quiz' : 'bank'}…`,
        'For example: make it shorter, or add two harder questions',
        (ask) => wholeQuizMessage(v, ask),
        actions,
        disabled
      )
    )
  );
  return out;
}

function renderRubric(
  v: RubricView,
  actions: PreviewActions,
  opts: RenderOptions
): HTMLElement[] {
  const out: HTMLElement[] = [
    header(
      'Rubric',
      v.title,
      [
        plural(v.criteria.length, 'criterion', 'criteria'),
        plural(v.max_points, 'point'),
      ],
      null
    ),
  ];
  if (v.description) out.push(h('p', {}, v.description));
  out.push(rubricGrid(v));
  out.push(
    h(
      'div',
      { class: 'criteria-asks' },
      ...v.criteria.map((c) =>
        askBox(
          `Change "${c.name}"…`,
          `What should change in "${c.name}"?`,
          (ask) => criterionMessage(v, c, ask),
          actions,
          opts.superseded
        )
      )
    )
  );
  out.push(
    h(
      'footer',
      {},
      askBox(
        'Ask Claude to change the whole rubric…',
        'For example: use four levels, or add a criterion for evidence',
        (ask) => wholeRubricMessage(v, ask),
        actions,
        opts.superseded
      )
    )
  );
  return out;
}

export function renderPreview(
  root: HTMLElement,
  view: PreviewView,
  actions: PreviewActions,
  opts: RenderOptions
): void {
  const body =
    view.view === 'quiz'
      ? renderQuiz(view, actions, opts)
      : renderRubric(view, actions, opts);
  const banner = opts.superseded
    ? h(
        'p',
        { class: 'superseded', role: 'status' },
        'A newer version is below.'
      )
    : null;
  root.replaceChildren(...(banner ? [banner] : []), ...body);
  root.classList.toggle('is-superseded', opts.superseded);
}

export function renderMessage(root: HTMLElement, text: string): void {
  root.replaceChildren(h('p', { class: 'muted' }, text));
}
